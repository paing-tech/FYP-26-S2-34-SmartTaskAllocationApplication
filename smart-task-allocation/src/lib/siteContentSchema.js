// Default marketing-site copy. Doubles as the CMS's starting values and as
// the fallback rendered before (or if) a section has no row in site_content
// yet, so the public site never shows blank content.
export const SITE_CONTENT_DEFAULTS = {
  nav: {
    hidden: false,
    brand: "OPTIMA",
    logoUrl: "/optimalogowhite.png",
    navItems: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Demo", href: "/democorner" },
      { label: "Contact Us", href: "/contact" },
    ],
    signInLabel: "Sign in",
    ctaLabel: "Experience",
  },
  hero: {
    hidden: false,
    headline: "Every Great Team Runs on Optima",
    subheadline: "One intelligent workspace for everything your team needs",
    ctaLabel: "Discover What's Possible",
    heroImageUrl: "/pages.gif",
  },
  features: {
    hidden: false,
    heading: "Everything you need for peak productivity",
    items: [
      {
        title: "AI Schedule Summary",
        icon: "schedule",
        image: "/aischedule.gif",
      },
      {
        title: "Prompt-to-Automation",
        icon: "automation",
        image: "/prompt-to-automation.gif",
      },
      {
        title: "Smart Inventory Checking",
        icon: "inventory",
        image: "/inventorychecking.gif",
      },
    ],
  },
  testimonials_section: {
    hidden: false,
    badge: "Testimonials",
    heading: "Loved by the Community",
    subheading: "See what our users say",
  },
  pricing: {
    hidden: false,
    badge: "Pricing",
    heading: "Maximize your team's potential",
    subheading: "Start free, then upgrade as your team grows. Transparent pricing, no hidden fees.",
    plans: [
      {
        name: "Starter",
        color: "#2563EB",
        tag: "",
        price: "$0",
        cadence: "/forever",
        description: "For individuals and small teams getting started.",
        features: [
          "Core task allocation",
          "All user roles available",
          "Unlimited users",
          "Organizational hierarchy management",
          "Schedule management",
          "Smart notifications",
          "Basic support",
        ],
        cta: "Try Optima",
        highlighted: false,
      },
      {
        name: "Pro",
        color: "#7C3AED",
        tag: "per user",
        price: "$9",
        cadence: ".99/monthly",
        description:
          "For professionals ready to unlock intelligent automation and the full power of Optimus AI.",
        features: [
          "Everything in Starter",
          "Full access to Optimus AI",
          "Personal AI Agent",
          "AI recommendations and automation",
          "Intelligent Workforce Matching",
          "Allocation history and smart reassignment",
          "700,000 tokens usage weekly",
          "Priority support",
        ],
        cta: "Try Optima",
        highlighted: false,
      },
      {
        name: "Team",
        color: "#E8A23D",
        tag: "per team",
        price: "$49",
        cadence: ".99/monthly",
        description: "Best for organizations seeking to maximize productivity with Optimus AI.",
        features: [
          "Everything in Pro",
          "Organization-wide AI access",
          "More AI agent usage",
          "Centralized billing and administration",
          "Dedicated support",
        ],
        cta: "Try Optima",
        highlighted: false,
      },
    ],
  },
  footer: {
    hidden: false,
    copyrightText: "Copyright © 2026 Optima Lab. All rights reserved.",
    aboutLabel: "About us",
    aboutTooltip: "The less you know, the better",
    socialLinks: [
      { name: "GitHub", href: "https://github.com" },
      { name: "Discord", href: "https://discord.com" },
      { name: "Telegram", href: "https://telegram.org" },
    ],
  },
};
