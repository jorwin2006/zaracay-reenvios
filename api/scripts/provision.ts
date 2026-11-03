import 'dotenv/config';
import {Pool} from 'pg';
import argon2 from 'argon2';
import ipaddr from 'ipaddr.js';

const [action,...args]=process.argv.slice(2);
if(!process.env.DATABASE_URL)throw Error('Configurar DATABASE_URL en api/.env');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function run(){
  if(action==='user'){
    const [username,role]=args;
    const password=process.env.PROVISION_PASSWORD;
    if(!username||!['ADMIN','OPERADOR'].includes(role)||!password||password.length<14)throw Error('Uso: PROVISION_PASSWORD=<clave de 14+ caracteres> npm run provision -- user <usuario> <ADMIN|OPERADOR>');
    const hash=await argon2.hash(password,{type:argon2.argon2id});
    await pool.query(`INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,active=true`,[username,hash,role]);
    await pool.query(`UPDATE operator_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM users WHERE username=$1) AND revoked_at IS NULL`,[username]);
    console.log('Usuario aprovisionado y sesiones anteriores revocadas:',username,role);
  } else if(action==='network'){
    const [description,cidr]=args;
    if(!description||!cidr)throw Error('Uso: npm run provision -- network <nombre> <IP/CIDR>');
    ipaddr.parseCIDR(cidr);
    await pool.query('INSERT INTO authorized_networks(description,cidr) VALUES($1,$2::cidr)',[description,cidr]);
    console.log('Red autorizada:',description,cidr);
  } else if(action==='destination'){
    const name=args.join(' ').trim().toUpperCase();
    if(!name)throw Error('Uso: npm run provision -- destination "GUAYAQUIL"');
    await pool.query('INSERT INTO destinations(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=true',[name]);
    console.log('Destino cargado:',name);
  } else throw Error('Acciones: user | network | destination');
}
run().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
