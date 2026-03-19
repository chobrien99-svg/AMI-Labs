import Link from "next/link";

const explainers = [
  {
    icon: "🧠",
    title: "What is AMI Labs?",
    description:
      "Advanced Machine Intelligence is building the next generation of AI — systems that reason about the physical world, not just language. Founded in 2025 by Yann LeCun and Alexandre LeBrun.",
    href: "/explainers",
    linkLabel: "Our mission →",
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
      "A world-class team of researchers, engineers, and operators across Paris, New York, Montreal, and Singapore — united by a shared conviction that AI can do far more than generate text.",
    href: "/org-chart",
    linkLabel: "Meet the team →",
  },
];

export default function ExplainerStrip() {
  return (
    <section className="home-section">
      <div className="home-section-header">
        <span className="home-section-label">About AMI Labs</span>
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
