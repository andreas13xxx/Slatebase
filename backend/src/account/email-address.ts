// Strict address check for anything we SEND mail to.
//
// The profile's `email` field accepts the loose "x@y.z" shape, which is fine for display but
// not for delivery: a value such as `a,b@evil.org` would be split by the mailer into two
// recipients. Only plain dot-atom addresses (no quotes, comma, semicolon, angle brackets,
// whitespace, comments) may receive mail.

const PLAIN_EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function isPlainEmailAddress(value: string): boolean {
  return value.length <= 254 && PLAIN_EMAIL.test(value)
}
