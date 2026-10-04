-- Prisma uses a PostgreSQL connection, not Supabase's anon/authenticated roles.
-- One atomic block: a failed postcondition rolls back all privilege changes.
-- Do not change PUBLIC, schema USAGE, service_role, RLS, policies or data.
DO $security$
DECLARE
  api_role RECORD;
  owner_oid OID;
  app_function RECORD;
BEGIN
  SELECT oid INTO owner_oid FROM pg_roles WHERE rolname = 'postgres';

  FOR api_role IN SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', api_role.rolname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role.rolname);

    -- No application functions are defined by the current Prisma migrations.
    -- Cover existing non-extension functions without changing extension-owned objects.
    FOR app_function IN
      SELECT p.oid, p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind IN ('f', 'w')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', app_function.signature, api_role.rolname);
      -- EXECUTE inherited from PUBLIC needs a separately reviewed change; never
      -- silently claim the function is protected by a direct-role REVOKE alone.
      IF has_function_privilege(api_role.oid, app_function.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Role % retains EXECUTE on %. Review inherited/PUBLIC grants before deployment.', api_role.rolname, app_function.signature;
      END IF;
    END LOOP;

    IF owner_oid IS NULL THEN
      RAISE EXCEPTION 'Supabase API roles exist but postgres does not; review the object-creator role before deployment.';
    END IF;

    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', api_role.rolname);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', api_role.rolname);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', api_role.rolname);

    -- Schema-local defaults cannot negate a global default GRANT. Do not change
    -- other schemas to compensate: stop atomically if such a grant is present.
    IF EXISTS (
      SELECT 1 FROM pg_default_acl a CROSS JOIN LATERAL aclexplode(a.defaclacl) grant_entry
      WHERE a.defaclrole = owner_oid AND a.defaclnamespace = 0 AND a.defaclobjtype IN ('r', 'S')
        AND CASE WHEN grant_entry.grantee = 0 THEN true
          ELSE pg_has_role(api_role.oid, grant_entry.grantee, 'USAGE') END
    ) THEN
      RAISE EXCEPTION 'Role % inherits global default table/sequence privileges; review before deployment.', api_role.rolname;
    END IF;

    -- Catch grants inherited through PUBLIC/role membership, column grants and
    -- objects whose grants the migration user was not allowed to revoke.
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE CASE WHEN n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
        has_table_privilege(api_role.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          -- MAINTAIN exists from PostgreSQL 17; preserve older local compatibility.
          OR CASE WHEN current_setting('server_version_num')::integer >= 170000 THEN
            has_table_privilege(api_role.oid, c.oid, 'MAINTAIN') ELSE false END
          OR has_any_column_privilege(api_role.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
        ELSE false END
    ) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      -- CASE prevents the planner from evaluating sequence privileges on tables.
      WHERE CASE WHEN n.nspname = 'public' AND c.relkind = 'S' THEN
        has_sequence_privilege(api_role.oid, c.oid, 'USAGE, SELECT, UPDATE')
        ELSE false END
    ) THEN
      RAISE EXCEPTION 'Role % retains effective privileges on public tables/sequences; review inherited or column grants before deployment.', api_role.rolname;
    END IF;
  END LOOP;
  -- Ordinary local databases without either API role are intentionally a no-op.
END
$security$;
