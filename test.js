import speakeasy from "speakeasy";

//Generate a secret key First.

var secret = speakeasy.generateSecret({length: 30});

console.log(secret.base32);

//using speakeasy generate one time token.

var token = speakeasy.totp({

secret: secret.base32,

encoding: 'base32',

});

console.log(token);