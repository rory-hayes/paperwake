import {z} from 'zod';

export type PaperwakeAccountEmailKind='email_verification'|'password_reset'|'password_changed';
export type PaperwakeAccountEmailInput={
  kind:PaperwakeAccountEmailKind;origin?:string;actionUrl?:string;
  supportEmail?:string;senderEmail?:string;passwordChangeSource?:'reset'|'settings';
};
export type PaperwakeAccountEmailContent={
  subject:string;text:string;html:string;replyTo?:string;templateVersion:'paperwake-account-v1';
};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const validEmail=(value:string|undefined)=>value&&z.string().max(254).email().safeParse(value).success?value:undefined;
const invalid=():never=>{throw new Error('Account email template input is invalid.');};

/** Only the caller's configured application origin is accepted, never a redirect
 * from a request. No network calls, remote images, tracking pixels or web fonts.
 * Persist the returned content once at enqueue time; never re-render on retry. */
export function renderPaperwakeAccountEmail(input:PaperwakeAccountEmailInput):PaperwakeAccountEmailContent{
  if(!['email_verification','password_reset','password_changed'].includes(input.kind))invalid();
  let origin:string|undefined;
  if(input.origin!==undefined){
    try{
      const url=new URL(input.origin),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||input.origin!==url.origin&&input.origin!==url.origin+'/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&local))invalid();
      origin=url.origin;
    }catch{invalid();}
  }
  const changed=input.kind==='password_changed';
  let actionUrl:string|undefined;
  if(!changed){
    if(!origin||!input.actionUrl)invalid();
    try{
      const url=new URL(input.actionUrl!),path=input.kind==='email_verification'?'/verify-email/confirm':'/reset-password';
      if(url.origin!==origin||url.username||url.password||url.pathname!==path||url.search||!/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash))invalid();
      actionUrl=url.href;
    }catch{invalid();}
  }else{
    if(input.actionUrl!==undefined||input.passwordChangeSource!==undefined&&!['reset','settings'].includes(input.passwordChangeSource))invalid();
    if(origin)actionUrl=new URL('/forgot-password',origin).href;
  }
  const replyTo=validEmail(input.supportEmail),sender=validEmail(input.senderEmail);
  const verification=input.kind==='email_verification';
  const subject=verification?'Verify your Paperwake email':changed?'Your Paperwake password was changed':'Reset your Paperwake password';
  const title=verification?'Confirm your email address.':changed?'Your password was changed.':'Reset your password.';
  const label=verification?'ACCOUNT VERIFICATION':changed?'ACCOUNT SECURITY':'PASSWORD RESET';
  const intro=verification?'Thanks for signing up for Paperwake. Confirm your email address to finish setting up your account.':changed?'Your Paperwake password has been updated. If you made this change, no further action is needed.':'We received a request to reset the password for your Paperwake account.';
  const detail=verification?'On the next page, enter your current Paperwake password.':changed?(input.passwordChangeSource==='reset'?'All previous browser sessions have been signed out.':input.passwordChangeSource==='settings'?'Your other browser sessions have been signed out. The session you used to change your password remains signed in.':'Previous browser sessions have been signed out, except the session used to change your password in Settings.'):'Choose a new password using the button below. Your password will stay the same until you complete this step.';
  const action=verification?'Confirm email address':changed?'Secure my account':'Reset password';
  const expiry=verification?'This link expires 24 hours after your request.':'This link expires 30 minutes after your request.';
  const safetyTitle=changed?'Didn’t make this change?':verification?'Didn’t sign up?':'Didn’t request a reset?';
  const safety=changed?'Open Paperwake and choose “Forgot password” on the sign-in page to reset your password.':verification?'You can safely ignore this email. Your account will not be verified unless you complete the next step.':'You can safely ignore this email. Your password has not changed.';
  const preheader=verification?'Confirm your email address to get started with Paperwake.':changed?'A security update for your Paperwake account.':'Choose a new password for your Paperwake account.';
  const p=(value:string)=>`<p style="margin:0 0 18px;color:#50576b;font-size:16px;line-height:26px;">${escape(value)}</p>`;
  const cta=actionUrl?`<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 16px;"><tr><td bgcolor="#5c69c4" style="border-radius:8px;"><a href="${escape(actionUrl)}" style="display:inline-block;padding:15px 24px;border:1px solid #5c69c4;border-radius:8px;color:#ffffff;background-color:#5c69c4;font-size:15px;font-weight:bold;line-height:20px;text-decoration:none;mso-padding-alt:0;"><!--[if mso]><i style="mso-font-width:150%;mso-text-raise:24pt;" hidden>&emsp;</i><![endif]--><span style="mso-text-raise:12pt;">${action}</span><!--[if mso]><i style="mso-font-width:150%;" hidden>&emsp;</i><![endif]--></a></td></tr></table>`:'';
  const fallback=actionUrl?`<p style="margin:22px 0 0;color:#687086;font-size:12px;line-height:20px;">${changed?'Password recovery:':'If the button doesn’t work, open this link:'}<br><a href="${escape(actionUrl)}" style="color:#5c69c4;text-decoration:underline;word-break:break-all;">${escape(new URL(actionUrl).host+new URL(actionUrl).pathname)}</a></p>`:'';
  const help=replyTo?`Need a hand? <a href="mailto:${escape(replyTo)}" style="color:#5c69c4;text-decoration:underline;">Contact support</a> or reply to this email.`:'This is an account notification from Paperwake.';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(subject)}</title><style>@media only screen and (max-width:620px){.outer{padding:20px 12px!important}.content{padding:28px 22px!important}.title{font-size:26px!important;line-height:33px!important}}</style></head><body style="margin:0;padding:0;background-color:#f5f6fc;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;"><div style="display:none;font-size:1px;color:#f5f6fc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f6fc"><tr><td class="outer" align="center" style="padding:40px 20px;"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;"><tr><td style="padding:0 8px 24px;color:#13151b;font-size:28px;font-weight:bold;letter-spacing:-1.2px;">Paperwake<span style="color:#6573d5;">.</span></td></tr><tr><td class="content" bgcolor="#ffffff" style="padding:36px 40px;border:1px solid #e6e8ef;border-top:4px solid #6573d5;border-radius:12px;"><p style="margin:0 0 16px;color:#5c69c4;font-size:11px;font-weight:bold;letter-spacing:1.5px;line-height:18px;">${label}</p><h1 class="title" style="margin:0 0 22px;color:#13151b;font-size:30px;line-height:38px;font-weight:bold;letter-spacing:-.8px;">${title}</h1>${p(intro)}${p(detail)}${changed?'':cta}${changed?'':`<p style="margin:0 0 26px;color:#687086;font-size:13px;line-height:21px;">${expiry}</p>`}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:20px;background-color:#f5f6fc;border-radius:8px;"><p style="margin:0 0 6px;color:#13151b;font-size:14px;font-weight:bold;line-height:22px;">${safetyTitle}</p><p style="margin:0;color:#50576b;font-size:14px;line-height:22px;">${escape(safety)}</p></td></tr></table>${changed?cta:''}${fallback}</td></tr><tr><td style="padding:24px 12px 0;color:#687086;font-size:12px;line-height:20px;text-align:center;"><p style="margin:0 0 10px;">${help}</p>${sender?`<p style="margin:0 0 10px;">Sent by Paperwake from <span style="color:#50576b;">${escape(sender)}</span>.</p>`:''}<p style="margin:0;">We’ll never ask you to send your password by email.</p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  const text=[`Paperwake\n\n${title}`,intro,detail,changed?`${safetyTitle}\n${safety}`:undefined,actionUrl?`${action}:\n${actionUrl}`:undefined,changed?undefined:expiry,changed?undefined:`${safetyTitle}\n${safety}`,replyTo?`Need help? Reply to this email or contact ${replyTo}.`:undefined,sender?`Sent by Paperwake from ${sender}.`:undefined,'We’ll never ask you to send your password by email.'].filter(Boolean).join('\n\n');
  if(Buffer.byteLength(html)>6144||Buffer.byteLength(text)>4096)invalid();
  return {subject,text,html,...replyTo?{replyTo}:{},templateVersion:'paperwake-account-v1'};
}
