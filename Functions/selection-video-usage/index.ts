import {createUsageHandler} from './handler.mjs';
Deno.serve(createUsageHandler({env:(name:string)=>Deno.env.get(name)}));
