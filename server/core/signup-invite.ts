import {createHash,timingSafeEqual} from 'node:crypto';
import {acceptsPreviewInvite,previewEnabled} from './preview.js';

type Environment=Record<string,string|undefined>;
const validCode=(value:string)=>value.length>=32&&value.length<=256&&!/\s|[\u0000-\u001f\u007f]/.test(value);
/** Separate from billing mode, allowing invitation-only live paid pilots. */
export function validateSignupInviteConfiguration(environment:Environment=process.env){
 const code=environment.PAPERWAKE_SIGNUP_INVITE_CODE;
 if(code!==undefined&&!validCode(code))throw new Error('PAPERWAKE_SIGNUP_INVITE_CODE must be 32–256 characters without whitespace, or unset.');
}
export function signupInviteRequired(environment:Environment=process.env){
 return previewEnabled(environment)||environment.PAPERWAKE_SIGNUP_INVITE_CODE!==undefined;
}
export function acceptsSignupInvite(value:unknown,environment:Environment=process.env){
 try{validateSignupInviteConfiguration(environment);}catch{return false;}
 if(!acceptsPreviewInvite(value,environment))return false;
 // Preview keeps its original invite semantics. The pilot code applies when
 // preview is off and cannot bypass a preview's separate private invitation.
 if(previewEnabled(environment))return true;
 const code=environment.PAPERWAKE_SIGNUP_INVITE_CODE;
 if(code===undefined)return true;
 if(typeof value!=='string'||value.length>256)return false;
 const digest=(text:string)=>createHash('sha256').update(text).digest();
 return timingSafeEqual(digest(value),digest(code));
}
