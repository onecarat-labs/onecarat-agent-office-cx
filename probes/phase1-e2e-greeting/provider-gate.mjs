// Pinned to codex rust-v0.169.0, model-provider/src/chatgpt_base_url.rs.
export const officialChatgptBaseUrl='https://chatgpt.com/backend-api/';

export function assertProviderAllowed(result) {
  const c=result.config??{},provider=c.model_provider??'openai',definition=c.model_providers?.[provider];
  // Preserve the existing guards. Only the exact official default is exempted.
  // Do not normalize, trim, parse or accept URL prefixes here.
  if(provider!=='openai'||definition||
    (c.chatgpt_base_url&&c.chatgpt_base_url!==officialChatgptBaseUrl)||c.openai_base_url) {
    throw Error('CUSTOM_PROVIDER_REQUIRES_REVIEW');
  }
}
