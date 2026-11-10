import {signupTermsPolicyMaxBytes,type SignupPolicyInput} from '../../shared/signup-terms.js';
import {validateSignupPolicy} from './signup-terms.js';

type Environment=Record<string,string|undefined>;
export const signupPolicyEnvironmentKeys=['PAPERWAKE_SIGNUP_POLICY_JSON','PAPERWAKE_SIGNUP_POLICY_VERSION','PAPERWAKE_SIGNUP_POLICY_SHA256'] as const;
const unavailable=():never=>{throw Object.assign(new Error('Signup terms configuration is unavailable.'),{statusCode:503});};

/** Operator-supplied text only. All pins must match; never fetch or invent terms. */
export function configuredSignupPolicy(environment:Environment=process.env):SignupPolicyInput|null{
 if(signupPolicyEnvironmentKeys.every(key=>environment[key]===undefined))return null;
 const json=environment.PAPERWAKE_SIGNUP_POLICY_JSON,version=environment.PAPERWAKE_SIGNUP_POLICY_VERSION,pin=environment.PAPERWAKE_SIGNUP_POLICY_SHA256;
 if(!json||Buffer.byteLength(json,'utf8')>signupTermsPolicyMaxBytes||!version||version.length>80||!pin||!/^[a-f0-9]{64}$/.test(pin))return unavailable();
 try{
  // Reuse the exact schema, canonical all-field digest and byte limit used by
  // acceptance snapshots. A stale version or content pin never disables terms.
  const {sha256,...policy}=validateSignupPolicy(JSON.parse(json));
  if(policy.version!==version||sha256!==pin)return unavailable();
  return policy;
 }catch{return unavailable();}
}
