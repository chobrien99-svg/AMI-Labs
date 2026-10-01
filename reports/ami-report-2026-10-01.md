# AMI Labs Observatory: Q3 2026

*July–October 2026: A lab of 54 consolidates around world models, JEPA architectures, and growing public scrutiny of its funding and roadmap. · The French Tech Journal*

In the 90-day window ending 1 October 2026, AMI Labs produced 13 new tracked papers against a cumulative catalogue of 746, with JEPA-family architectures — spanning video, graph, music, and embodied control — forming the clearest thematic thread. The period was defined less by research volume than by institutional visibility: AMI entered France's Next40 index, attracted reported Samsung interest, and drew sustained press attention tied to a fundraise reported variously as €890 million and €1 billion. Yann LeCun accounted for 45 of the roughly 663 news items tracked and appeared as a named author or co-author on seven of the thirteen new papers, underscoring how heavily the lab's external profile remains anchored to a single figure. A notable secondary signal is the arrival of Li Haoyi, whose September Hacker News post announcing he was joining AMI to work on world models generated modest but distinct coverage, suggesting the lab is beginning to recruit from software-engineering audiences beyond the traditional ML research pipeline.

## Research

The quarter's output clusters visibly around joint-embedding predictive architectures: LeVJEPA (efficient video pretraining, co-authored by Lucas Maes, Quentin Le Lidec, and Yann LeCun), LpWM (sparse representations in world models, same trio, 2 citations already), HP-JEPA (hierarchical graph learning), Music-JEPA (sound world models), and Patch Policy (embodied control via dense visual representations) all appeared between late July and late August. Two papers sit outside this core: Pedro O. Pinheiro's DyAb, published in mAbs on 28 August, addresses antibody design in a low-data regime — an outlier domain relative to the lab's dominant focus — and Xinyi Wan's StarVerus, presented at ACM SIGKDD, targets LLM-powered Rust code verification. A Communications of the ACM piece co-authored by LeCun on openness frameworks for foundation models is the quarter's only policy-adjacent publication. The lab's most-cited historical work remains anchored in computer vision fundamentals — CBAM (25,647 citations), MoCo (15,695), and MAE (12,742) — reflecting the FAIR-era lineage of much of the senior roster rather than AMI's current research bets.

## Engineering & Open Source

Public GitHub activity across AMI members was modest in volume but directionally consistent with the research agenda. Quentin Le Lidec was the dominant contributor to galilai-group/stable-worldmodel (activity score 269), an external reproducibility platform for world-model research; Brian Li contributed to two external EvolvingLMMs-Lab repositories — lmms-eval (score 132) and lmms-engine (score 4) — focused on multimodal model evaluation and training infrastructure. Basile Terver contributed to Trick5t3r/eb_jepa, an energy-based JEPA fork with ties to Meta AI Research, and Min Lin maintained activity on his personal torch2jax repository. All five projects are external or personal-account repositories; none is an AMI-owned asset, and the overall public engineering footprint remains limited for a lab of 54.

## People & Network

The roster stands at 54, distributed across Science & Research Leadership (18), an unassigned cohort (13), Research & Engineering (11), Leadership (6), and Operations (6); the 13-person unassigned group is worth monitoring as a signal of ongoing onboarding or role fluidity. The co-authorship graph records 100 edges, with the densest historical pairs being Chao Du / Min Lin (36 shared papers) and Pascale Fung / Willy Chung (16); among LeCun-anchored pairs, Adrien Bardes leads at 15 joint papers. Shared institutional history is heavily concentrated at Meta FAIR (386 of 415 shared-history edges), with NYU and Google/DeepMind each contributing 11 — a profile that is coherent but leaves the network's diversity of intellectual lineage thin. Li Haoyi's public announcement of joining to work on world models is the quarter's most visible recruitment signal.

## In the Press

AMI Labs generated 663 tracked news items in the window, a high count driven largely by fundraising and index-entry coverage rather than research breakthroughs. French-language outlets — L'Usine Nouvelle, Les Echos, La Tribune, La Voix de France — dominated the corpus, covering AMI's entry into the Next40, reported Samsung investment interest, and LeCun's public framing that he will not describe the lab's AI as AGI or superintelligence (TechCrunch, 16 July). A September piece in The Eastern Herald noted that AMI Labs and World Labs together hold $2.3 billion without either having disclosed a revenue model — a line of scrutiny likely to recur. CEO Alexandre LeBrun registered six mentions, making him the second most-cited individual by a wide margin, though still at a fraction of LeCun's 95-mention tally.

## By the numbers

- **Team:** 54 people — 18 Science & Research Leadership, 13 Unassigned, 11 Research & Engineering, 6 Leadership, 6 Operations.
- **Research:** 13 new paper(s) in window; 746 tracked.
- **Network:** 100 co-authorship link(s), 415 shared-history link(s), 53 reporting link(s).
- **News:** 663 item(s) in window.

### New research this period

- [DyAb: sequence-based antibody design and property prediction in a low-data regime](https://doi.org/10.1080/19420862.2026.2717460) (2026-08-28, mAbs) — Pedro O. Pinheiro
- [LeVJEPA: Efficient&Scalable Video Pretraining without the Heuristics](https://www.semanticscholar.org/paper/437cb869d42d536ad1b2f35399c99ab79ec65d5a) (2026-08-27) — Lucas Maes, Quentin Le Lidec, Yann LeCun
- [LpWM: A Case for Sparse Representations in World Models](https://www.semanticscholar.org/paper/302343f7676e209391f3d5e3409a1b157c9df45a) (2026-08-24) — Quentin Le Lidec, Lucas Maes, Yann LeCun
- [Advancing Open and Reproducible Relational Learning: RelArena-$\alpha$, TabPFN-Rel and RPI](https://www.semanticscholar.org/paper/f587565885eaa432dda4a0bfd55fa20019b56dee) (2026-08-17) — Yann LeCun
- [StarVerus: LLM-Powered Multi-Agent Collaboration for Industrial Rust Code Verification Automation](https://doi.org/10.1145/3770855.3818485) (2026-08-08, Proceedings of the 32nd ACM SIGKDD Conference on Knowledge Discovery and Data Mining V.2) — Xinyi Wan
- [Towards Physics of Multimodal Pretraining: Knowledge Flow, Modality Synergy, Early Unification, and Recipes](https://www.semanticscholar.org/paper/211a73f11a8722d61f7cea91b2c52fd4f9aa2ff6) (2026-08-05) — David Fan
- [Self-supervised DXA representations encode multi-system disease risk, biological aging and heritability](https://www.semanticscholar.org/paper/1006651b762e229b32cc001bb287c3f607749447) (2026-08-03) — Yann LeCun
- [HP-JEPA: Hierarchical Partitioning for Multi-Resolution Graph Joint-Embedding Predictive Learning](https://www.semanticscholar.org/paper/f4578e2fa551e6b991125e5f8770212337476fee) (2026-08-01) — Yann LeCun
- [Unpacking Open Source Artificial Intelligence: Toward a Framework for Openness in Foundation Models](https://doi.org/10.1145/3778264) (2026-07-29, Communications of the ACM) — Yann LeCun
- [Music-JEPA: Learning a World Model of Sound from Action](https://doi.org/10.48550/arXiv.2607.22000) (2026-07-24, arXiv.org) — Yann LeCun
- [Patch Policy: Efficient Embodied Control via Dense Visual Representations](https://doi.org/10.48550/arXiv.2607.18236) (2026-07-20, arXiv.org) — Yann LeCun
- [Separating Representation from Reconstruction Enables Scalable Text Encoders](https://doi.org/10.48550/arXiv.2607.04011) (2026-07-04, arXiv.org) — Megi Dervishi, Yann LeCun

### Shared histories

- **Meta (FAIR):** 386 connection(s) among the team.
- **NYU:** 11 connection(s) among the team.
- **Google / DeepMind:** 11 connection(s) among the team.
- **bytedance:** 2 connection(s) among the team.
- **nabla:** 1 connection(s) among the team.
- **mila quebec artificial intelligence institute:** 1 connection(s) among the team.
- **Microsoft:** 1 connection(s) among the team.
- **hkust:** 1 connection(s) among the team.

### Frequent co-authors

- Chao Du & Min Lin — 36 paper(s)
- Pascale Fung & Willy Chung — 16 paper(s)
- Adrien Bardes & Yann LeCun — 15 paper(s)
- Michael Rabbat & Yann LeCun — 13 paper(s)
- Mikael Henaff & Yann LeCun — 13 paper(s)
- Delong Chen & Pascale Fung — 11 paper(s)
- Quentin Garrido & Yann LeCun — 11 paper(s)
- Amir Bar & Yann LeCun — 9 paper(s)

### Most in the news

- Yann LeCun — 95 mention(s)
- Alexandre LeBrun — 6 mention(s)
- Quentin Le Lidec — 4 mention(s)
- Li Haoyi — 2 mention(s)
- Lucas Maes — 2 mention(s)
- Adithya Iyer — 1 mention(s)
- Adrien Bardes — 1 mention(s)
- Amir Bar — 1 mention(s)

### Notable coverage

- [Why AMI Labs’ Alexandre LeBrun won't call his AI 'AGI' or 'superintelligence' | TechCrunch](https://techcrunch.com/2026/07/16/why-ami-labs-alexandre-lebrun-wont-call-his-ai-agi-or-superintelligence/) (TechCrunch, 2026-07-16) — Alexandre LeBrun
- [Joining Advanced Machine Intelligence to work on world models](https://www.lihaoyi.com/post/JoiningAMItoworkonWorldModels.html) (Hacker News, 2026-09-07) — Li Haoyi
- [Ami Labs, Mistral, Gobano Robotics... Avec l’IA, les pépites françaises veulent créer les robots de demain](https://www.usinenouvelle.com/technos-et-innovations/robotique/ami-labs-mistral-gobano-robotics-avec-lia-les-pepites-francaises-veulent-creer-les-robots-de-demain.RYKM65UVRBKLBPHOPD6KUS5U5Y.html) (L'Usine Nouvelle [FR], 2026-09-17)
- [World Labs and AMI Labs Have $2.3 Billion to Rethink AI: Neither Will Say How It Makes Money - The Eastern Herald](https://news.google.com/rss/articles/CBMihwFBVV95cUxQTllROEE5T0cwREhWd3p1d2xIOFZGVXQ4M2dYZGg4aVVfT1F5MTluTzFJQjhOazZVLXNlZUFCaE9jc3ZadmFlbTg5ak5QVUxtaEtoaHhUV2lYZ1pEcUNTbTRCRTBobWp0dWRTemtabERPTElfTm5hdV9xOXJ1eDNjcnFXSGx5Q1U?oc=5) (Google News, 2026-09-21)
- [Yann Le Cun, fondateur d’AMI Labs, ex-directeur scientifique de l’IA de Meta : « Il faut construire des modèles qui comprennent vraiment le monde physique et réel » - La Tribune](https://news.google.com/rss/articles/CBMi2AJBVV95cUxPaVpSVnB1ZHc1NXJDSWVvcGMweTFaZUgxcEJUdzFMM0pieEI2Rm9yQmE4ZlEta21xaGpjbm4wQ0JQSE1UeGt2ZzNjOXRxeDVvZUtqLWdqVlg0QXhZTHVIMFZ6LTktRGRjeEpBWG1CMXJHVlBpdWtPY2lhcTUtZG4zSUQ1bGwwdWFsdWFGUEUydzRWZVFxYWw0N1d0QWhYeG5sZ0Y0NTB0QVJQcmpHREJCcHRVRVNCNWE0RnZ5QUhHdVRDRUJqYUNPcF96cUFjZXI1cExrWURxSjFMemJWaWtjUjlEMWRnUDJTSHpReHJfdU9qY19VcTRvUmhiVnNaem5oRlVDRWZCTFozbUViWU9GNjRVN2M0RFQtaXUtVTM4Sm5GUV9oemlQMXg3UE50ODZITU00SGRTSXFyQzBmNGotaFBwYXloTzNITEphZXNtSURmNXh1d3k3OA?oc=5) (Google News, 2026-09-20) — Yann LeCun
- [Ami Labs, Mistral, Gobano Robotics... Avec l’IA, les pépites françaises veulent créer les robots de demain - L'Usine Nouvelle](https://news.google.com/rss/articles/CBMinwJBVV95cUxOTTlfbGM4SHl5c19fWThrTjJrbVpyOF94aXUwM0xkbDRTRUh2S3Vjd2g2YkNDQ2c0QzR0OW5GTHRBV3lOYXZtckZCX0RSaFhKR0RCV0RpN1F4NFdwOUQ2THlSOTR5T2x0OThVTTZGVWZuWTlZTE05TzVIY3hybUwwRTBJdnhfMTQtSXRMSTh4dzdoSVJ0d0w3Y3RXNFNtZkY4TjJlZzAzb3Q1UGxwUkNLRlpLcTJmTS1pTkt6LXlxYTFIQ3JoUmx2a2tnSGJOU2twRW5xYmdjUmRpYXZCT0NmWm84d2xXX3JCVGg4elBTdWMxcktPSkRmTmZ4Z1VtbmJEc0tvUWZsZTV6NDQxVzRnWEhYR2VHR1FVUU1FN2R3cw?oc=5) (Google News, 2026-09-17)
- [Mistral AI, AMI Labs… L'appétit grandissant de Samsung pour la French Tech](https://www.lesechos.fr/start-up/ecosysteme/mistral-ai-ami-labs-lappetit-grandissant-de-samsung-pour-la-french-tech-2250326) (Les Echos, 2026-09-08)
- [Mistral AI, AMI Labs… L'appétit grandissant de Samsung pour la French Tech - Les Echos](https://news.google.com/rss/articles/CBMiwAFBVV95cUxNc2NzcVZ1ZGphZzl6bWNHRW1taHFYNGF4SEd0UUppRGhPNlBYMzJOaG9Xd0dDMzJ6Tk1fM1pJb2h3SktQa1lvZW5UVG4yUXJSanE0Qno5SFUwSVhoYm51VGo3TDctV3QyX3VjcjQzaUtxaVpfanZpMU1KSUstM3FhbEdGQUZ3azVQQUtoSlN6YW9PNmhrTGt5TnUwWkJYTTEyZXNEcnV5ajNBYnBYVzB6MkhibUhpeFF5V1N2ZGJMY0s?oc=5) (Google News, 2026-09-08)
- [IA : Mistral AI, AMI Labs et Snowflake propulsent 10 nouveaux milliardaires français au classement 2026 - lavoixdefrance.fr](https://news.google.com/rss/articles/CBMi4gFBVV95cUxNVHZfQjVKMzdZMkt0LXljMmxLS2pxYWNaMEVJVzVRemxNQUxpTm9hMDQxZlJjX21OX2l2aldvRmxLc2VZaGFwQjR6TXRTREVLOGlnNUtFT1dEWElkVzdLZF9JUmNhWEl1X2ZQT1I3VUluSThVRkh4NDY2RjVQbG5iUnhZS05CS2QxZUtTMF9qVDAyXzVlcmk1TVlVV1BTNFpuLUQ4VXpNNVQtQ3E5ZWUtclVEZ2VlcWFBWXlhczlYSXFrT0pucUV4a1QxaTNCV1hHOUlWX2prNmJtcmt0ek9DMGtB?oc=5) (Google News, 2026-08-08)
- [AMI Labs de Yann LeCun entre au Next40 trois mois après 890 millions levés, Bercy serre les critères - lavoixdefrance.fr](https://news.google.com/rss/articles/CBMi4AFBVV95cUxOUDV2aVh2WFBBQ1dDMVlISmdFd2VrbGw4ZVBnVHJSZ1FKQ0hKRUR2OGZpQVYyc0pJeXBWUzNHbV9WeUFKYzNZWGRxcnRPNUNQMExIM1QzZ0QxeUVldUNNNVRLbTR1WDUtNXRhcU1LbnZnNkp2WnVsZHRsM2FyRWhaOEdEZEtoQ0lLclhvaWZZOXc0bVhpbktlSkIzWENDMFBlMjgtSHhwbWltRU9JanVOX0JSaS1ua1FRUDZFeV9obTVidFJEQVUxeS1tR0FaanJlV2JRYk9hMHZPUGE4MVJ0Mg?oc=5) (Google News, 2026-08-07) — Yann LeCun

---

*Generated 2026-10-01 from the Observatory dossiers. Figures cover 2026-07-03 → 2026-10-01. *
