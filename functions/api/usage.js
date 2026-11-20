import {collectUsage} from '../../deployment/cloudflare/usage.mjs';
export const onRequest = ({request,env}) => collectUsage(request,env,false);
