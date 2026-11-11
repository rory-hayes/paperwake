import {z} from 'zod';
import {AccountEmailError,accountEmailLimits,accountEmailPayloadSchema,trustedAccountOrigin} from '../integrations/account-email.js';
import {renderPaperwakeAccountEmail} from '../integrations/account-email-template.js';
import {encryptSecret} from '../integrations/secrets.js';
import {installationConfiguration} from './installation.js';

type ContentInput=Omit<Parameters<typeof renderPaperwakeAccountEmail>[0],'origin'|'supportEmail'|'senderEmail'>;
const email=z.string().max(254).email();
function validEmail(value:string|undefined|null){const parsed=email.safeParse(value?.trim());return parsed.success?parsed.data:undefined;}

/** Render once at enqueue, then encrypt the complete immutable delivery payload.
 * Do not render at dispatch: changing templates/support settings must not alter
 * a retry under the same provider idempotency key.
 */
export function encryptedPaperwakeAccountEmail(to:string,input:ContentInput){
  const rendered=renderPaperwakeAccountEmail({...input,origin:trustedAccountOrigin(),
    supportEmail:validEmail(installationConfiguration().publicDetails.supportEmail),
    senderEmail:validEmail(process.env.FOLIO_AUTH_EMAIL_FROM)});
  const parsed=accountEmailPayloadSchema.safeParse({to,...rendered});
  if(!parsed.success)throw new AccountEmailError('invalid_message',false);
  const ciphertext=encryptSecret(JSON.stringify(parsed.data));
  if(Buffer.byteLength(ciphertext)>accountEmailLimits.encryptedPayload)throw new AccountEmailError('invalid_message',false);
  return ciphertext;
}
