// Single source of truth for pricing — page copy, plan caps, and amounts.
// Part B (plan/cap enforcement) imports the caps from here so marketing and
// enforcement can never drift apart. Client-safe: no server-only imports.

/** Plan caps + amounts (enforcement reads these too). */
export const FREE_STUDENT_CAP = 50;
export const PRO_STUDENT_CAP = 125;
export const PRO_PRICE_PER_YEAR = 60;
export const OVERAGE_BLOCK_SIZE = 25;
export const OVERAGE_PRICE_PER_BLOCK = 10;

const CONTACT = "info@stembuilder.io";
export const SUPPORT_EMAIL = "support@stembuilder.io";

function mailto(subject: string): string {
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;
}

export interface PricingCta {
  label: string;
  href: string;
  primary: boolean;
}

export interface PricingPlan {
  id: "free" | "pro" | "school";
  /** e.g. "Free" */
  name: string;
  /** e.g. "$0" or "$60/year" or "from $300/year" */
  price: string;
  blurb: string;
  features: string[];
  ctas: PricingCta[];
  footnote?: string;
}

export const PRICING_HERO = {
  h1: "Simple pricing. Free for teachers to start.",
  sub: "Try it and run a class free. Upgrade when you grow — or bring your school on board. Curriculum is included with every paid plan.",
};

export const PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "For a teacher getting started.",
    features: [
      "All six STEM tools",
      `Up to ${FREE_STUDENT_CAP} students`,
      "Join by class code or Google Classroom",
      "Student progress & assignments",
      "Student work saved automatically",
    ],
    ctas: [{ label: "Start free", href: "/teachers", primary: true }],
  },
  {
    id: "pro",
    name: "Teacher Pro",
    price: `$${PRO_PRICE_PER_YEAR}/year`,
    blurb: "For the teacher going all-in.",
    features: [
      "Everything in Free",
      `Up to ${PRO_STUDENT_CAP} students (then just $${OVERAGE_PRICE_PER_BLOCK} per additional ${OVERAGE_BLOCK_SIZE})`,
      "Access to our growing library of ready-to-teach projects & units",
    ],
    ctas: [{ label: "Go Pro", href: "/teachers/upgrade", primary: true }],
    footnote:
      "Teaching a full load already? Start a free Pro trial for the rest of the school year — everything in Pro except the curriculum library.",
  },
  {
    id: "school",
    name: "School & District",
    price: "from $300/year",
    blurb:
      "Simple, flat, and built for your whole school or district — everything in Teacher Pro for all your teachers and students.",
    features: [
      "Unlimited teachers & students at your school(s)",
      "Our growing curriculum & project library included",
      "Admin dashboard & usage reporting",
      "Rostering — Google Classroom",
      "Signed data privacy agreement (NDPA)",
      "A free trial to start",
    ],
    ctas: [
      { label: "Start a free trial", href: mailto("School/District free trial"), primary: true },
      { label: "Talk to us", href: mailto("School/District pricing"), primary: false },
    ],
  },
];

/** School & District pricing by enrollment. */
export const ENROLLMENT_TIERS: { range: string; price: string }[] = [
  { range: "Up to 500 students (incl. small private schools)", price: "$300/year" },
  { range: "501–2,500", price: "$600/year" },
  { range: "2,501–5,000", price: "$750/year" },
  { range: "5,001–10,000", price: "$900/year" },
  { range: "10,001–15,000", price: "$1,050/year" },
  { range: "15,001–20,000", price: "$1,200/year" },
  { range: "20,000+", price: "Let's talk" },
];

export const PD_ADDON = {
  name: "Add-on: Professional Development — Premium",
  body:
    "Hands-on training to get your team confident with 3D printing, laser cutting, and CNC — using STEM Builder and our curriculum. Available with any plan.",
  cta: { label: "Ask about PD", href: mailto("Professional Development"), primary: true },
};

export const PRICING_FOOTER_ITEMS = [
  "Free for teachers",
  "No ads, ever",
  "We never sell student data",
  "Students can join with no email",
];

export const PRICING_SUPPORT_LINE =
  "Questions? A real person is here to help —";
