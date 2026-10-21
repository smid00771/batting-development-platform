import {createRevocationHandler} from './handler.mjs';
Deno.serve(createRevocationHandler({env:(name:string)=>Deno.env.get(name)}));
