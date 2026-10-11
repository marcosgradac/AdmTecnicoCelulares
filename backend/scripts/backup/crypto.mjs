import { createCipheriv,createDecipheriv,randomBytes,createHash } from 'node:crypto'
const magic=Buffer.from('TDBACK01')
export const checksum=buffer=>createHash('sha256').update(buffer).digest('hex')
const checkKey=key=>{if(!Buffer.isBuffer(key)||key.length!==32)throw Error('A separate 32-byte key is required')}
export function encryptBuffer(plain,key,metadata){checkKey(key);const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(JSON.stringify(metadata)));return Buffer.concat([magic,nonce,cipher.update(plain),cipher.final(),cipher.getAuthTag()])}
export function decryptBuffer(encrypted,key,metadata){checkKey(key);if(encrypted.length<37||!encrypted.subarray(0,8).equals(magic))throw Error('Invalid encrypted backup');try{const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(8,20));decipher.setAAD(Buffer.from(JSON.stringify(metadata)));decipher.setAuthTag(encrypted.subarray(-16));return Buffer.concat([decipher.update(encrypted.subarray(20,-16)),decipher.final()])}catch{throw Error('Backup authentication failed')}}
