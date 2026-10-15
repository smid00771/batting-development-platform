import Stripe from 'npm:stripe@23.0.0';
import {createVideoPaymentHandler} from './handler.mjs';
// This instance only verifies webhooks; it makes no Stripe API requests.
const stripe=new Stripe('webhook-verification-only');
const cryptoProvider=Stripe.createSubtleCryptoProvider();
Deno.serve(createVideoPaymentHandler({env:(name:string)=>Deno.env.get(name),
 verifyEvent:(body:string,signature:string,secret:string)=>stripe.webhooks.constructEventAsync(body,signature,secret,300,cryptoProvider)}));
