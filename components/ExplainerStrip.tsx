import Link from "next/link";

const explainers = [
  {
    icon: "🧠",
    title: "What is AMI Labs?",
    description:
      "Advanced Machine Intelligence is one of the most closely watched AI startups in the world. Founded in 2025 by Yann LeCun and Alexandre LeBrun, it's building AI systems that reason about the physical world, not just language.",
    href: "/explainers",
    linkLabel: "About the company →",
  },
  {
    icon: "🌐",
    title: "What are World Models?",
    description:
      "World Models are AI systems that learn an internal representation of how the world works — enabling machines to plan, predict, and reason about physical reality the way humans do.",
    href: "/explainers",
    linkLabel: "The science →",
  },
  {
    icon: "👥",
    title: "The Team",
    description:
      "AMI Labs has assembled researchers, engineers, and operators across Paris, New York, Montreal, and Singapore. We track every key hire and leadership change as the team grows.",
    href: "/org-chart",
    linkLabel: "Meet the team →",
  },
];

export default function ExplainerStrip() {
  return (
    <section className="home-section">
      <div className="home-section-header">
        <span className="home-section-label">What You Need to Know</span>
      </div>
      <div className="explainer-strip">
        {explainers.map((card) => (
          <div key={card.title} className="explainer-card">
            <span className="explainer-icon" aria-hidden="true">{card.icon}</span>
            <h3 className="explainer-title">{card.title}</h3>
            <p className="explainer-desc">{card.description}</p>
            <Link href={card.href} className="explainer-link">
              {card.linkLabel}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
