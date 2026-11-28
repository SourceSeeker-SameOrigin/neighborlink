// Synthetic local checks only. Never reads configured cloud keys or real door passwords.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {encryptSecret,decryptSecret}=require('../../../cloudfunctions/_shared/crypto');
const key=crypto.randomBytes(32).toString('hex'),other=crypto.randomBytes(32).toString('hex');
const value='synthetic-door-test',box=encryptSecret(value,key),results=[];
const check=(name,fn)=>{try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}};
check('round trip',()=>assert.equal(decryptSecret(box,key),value));
check('wrong key rejected',()=>assert.throws(()=>decryptSecret(box,other)));
check('tag alteration rejected',()=>assert.throws(()=>decryptSecret({...box,tag:(box.tag[0]==='0'?'1':'0')+box.tag.slice(1)},key)));
check('ciphertext alteration rejected',()=>assert.throws(()=>decryptSecret({...box,ciphertext:(box.ciphertext[0]==='0'?'1':'0')+box.ciphertext.slice(1)},key)));
check('random IV for repeated plaintext',()=>assert.notEqual(encryptSecret(value,key).iv,box.iv));
check('short key rejected',()=>assert.throws(()=>encryptSecret(value,'short')));
check('missing key rejected',()=>assert.throws(()=>encryptSecret(value,undefined)));
check('unsupported algorithm rejected',()=>assert.throws(()=>decryptSecret({...box,algorithm:'unsupported'},key)));
console.log(JSON.stringify({scope:'synthetic local cryptography; not cloud key consistency, authorization, audit or cleanup acceptance',passed:results.filter(x=>x.passed).length,total:results.length,results},null,2));
if(results.some(x=>!x.passed))process.exitCode=1;
