import { createClient } from "next-sanity";

export const client = createClient({
  projectId: "k8hl9hed",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_READ_TOKEN,
});

export const writeClient = createClient({
  projectId: "k8hl9hed",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN,
});
