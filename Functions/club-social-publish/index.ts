import {createService} from './service.ts';
Deno.serve(createService(Deno.env.toObject()).handle);
