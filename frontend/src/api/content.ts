import axios from "axios";
import { API_BASE } from "./config";
import type { ContentItem } from "../types";

export async function fetchContentFeed(params?: {
  platform?: string;
  limit?: number;
  offset?: number;
}): Promise<ContentItem[]> {
  const res = await axios.get<ContentItem[]>(`${API_BASE}/api/v1/content`, {
    params,
  });
  return res.data;
}
