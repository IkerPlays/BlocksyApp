Nintendo 3DS: sign in from another device. Choose With QR, scan the code with a phone or tablet, log in there and tap Authorize; the 3DS signs in by itself and remembers the session (the Account button in game forgets it). Needs the new link-login.sql in the Game project.
Nintendo 3DS: network requests now use libcurl with mbedtls, which fixes the login error with the account server. Login errors now show the real reason.
Nintendo 3DS: the login no longer freezes the screen while connecting.
Web: new Link 3DS page to authorize a 3DS by QR link or by typing its 6 character code.
