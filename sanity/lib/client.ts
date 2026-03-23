import { createClient } from "next-sanity";

export const client = createClient({
  projectId: "k8hl9hed",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false, // false required for private datasets with token auth
  token: process.env.SANITY_API_READ_TOKEN,
});
