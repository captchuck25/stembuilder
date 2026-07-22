// Versioned compliance text. Bump the version whenever the affirmation wording
// changes — teacher_affirmations rows pin the version each user affirmed.

export const TEACHER_AFFIRMATION_VERSION = '2026-07-18.v1'

export const TEACHER_AFFIRMATION_TEXT =
  'I affirm that I am an educator aged 18 or older and that I am authorized by ' +
  'my school or district to create classes and enroll students on StemBuilder, ' +
  'including obtaining any parental consent my school requires.'

export type AccountOrigin = 'rostered' | 'class_code' | 'independent'
