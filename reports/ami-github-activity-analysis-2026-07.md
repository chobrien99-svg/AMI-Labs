# The machinery behind the mission

*An Observatory analysis — The French Tech Journal · window: last 90 days (snapshot: 2026-07-24)*

When a company raises a billion dollars to chase "real-world intelligence," the temptation is to watch for the finished product — the model, the demo, the benchmark win. The quieter and more revealing signal is what its researchers reach for when no one is watching. Over the last three months, the public GitHub activity of the AMI Labs team points not at polished models but at the *machinery*: the platforms, evaluation harnesses, and architectural experiments that a world-model research program actually runs on.

Five projects account for most of that effort — and, tellingly, none of them are AMI's own. They are external and community repositories, which is exactly what makes them worth reading. This is where AMI's people are investing *outside* their own walls, in the shared infrastructure of a research field.

## The world model, made reproducible

The single most active project is **`stable-worldmodel`** — an open platform (owned by the *galilai-group* organization, not AMI) for reproducible world-model research and evaluation, built in Python on PyTorch and organized around JEPA and model-predictive control. With north of 2,000 stars, it is a substantial community effort, and **Quentin Le Lidec**, a postdoctoral researcher on AMI Labs' Paris team, has been its dominant contributor in the window: dozens of pushes and pull requests, the footprint of a core maintainer rather than a passer-by.

World models sit at the heart of Yann LeCun's thesis for AMI — systems that learn how the world behaves and can *predict and plan* within it, rather than autoregressive text engines scaled ever larger. A shared, reproducible bench for that research is foundational plumbing. That an AMI researcher is helping build it, in public, says something about where the company believes progress comes from.

## JEPA, at the energy-based root

If world models are the destination, **JEPA** — the joint-embedding predictive architecture — is LeCun's proposed vehicle, and its energy-based formulation is the theoretical core. **Basile Terver**, a PhD researcher (*doctorant*) based in Paris, has been contributing to **`eb_jepa`**, a fork of an Energy-Based JEPA codebase associated with Meta / FAIR, whose original author list includes LeCun himself. The contribution is modest in volume (a couple of pull requests) but pointed in subject: this is work at the architectural foundation of the entire program, not at its periphery.

## Evaluation and training, for the multimodal frontier

Two of the five projects are about *measuring and training* models rather than proposing new ones, and both are driven by **Brian Li**, a Member of Technical Staff on AMI's Singapore team. The first, **`lmms-eval`** (4,000+ stars, from the EvolvingLMMs-Lab community), is a unified evaluation toolkit for frontier multimodal models spanning text, image, video, and audio — the kind of standardized yardstick a field needs before it can claim progress honestly. The second, **`lmms-engine`**, is a lean training engine built for large-scale multimodal experimentation, including video generation. Li's activity is concentrated in pull requests — extending and maintaining the shared tooling rather than forking off a private copy.

## The plumbing between frameworks

The smallest project is the most quietly strategic. **Min Lin**, who heads AMI's Singapore office, has been working in **`torch2jax`** — a tool for running PyTorch models inside the JAX ecosystem, including on TPUs. It is a modest fork with a big implication: portability across the two dominant deep-learning stacks, and across the hardware beneath them. For a lab that will train at scale on whatever silicon it can secure, the ability to move between PyTorch and JAX is not a footnote.

## The through-line

Read together, these are not five unrelated repositories; they are four faces of one program. **Build** the world model (`stable-worldmodel`), **root** it in the energy-based JEPA architecture (`eb_jepa`), **measure** it rigorously against the multimodal frontier (`lmms-eval`, `lmms-engine`), and **keep it portable** across frameworks and hardware (`torch2jax`). It is a research bet made legible through its infrastructure: not a scramble to ship a chatbot, but a patient investment in the machinery that a world-model program requires — and one that already spans two continents, from Paris to Singapore.

What is most striking is the posture. AMI's researchers are not merely *consuming* the open-source ecosystem around world models and multimodal AI — in several of these projects they are *building* it, in the open, alongside the wider community. For a company whose stated ambition is real-world intelligence, that is the mission expressed not in press releases but in commits.

---

*Editorial notes:*
- *Project facts (ownership, star counts, activity) are drawn from the 90-day GitHub analysis snapshot dated 2026-07-24; star counts are approximate and drift over time.*
- *Specific paper/arXiv citations were deliberately omitted; the research framing (world models, JEPA, energy-based models) reflects LeCun's well-documented public research agenda rather than any single unverified reference.*
