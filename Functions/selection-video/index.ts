import {createSelectionVideoHandler} from './handler.mjs';
Deno.serve(createSelectionVideoHandler({env:(name:string)=>Deno.env.get(name)}));
