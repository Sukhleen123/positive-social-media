import axios from "axios";
import { API_BASE } from "./config";
import type { UserProfile, TriggerProfile } from "../types";

export async function createUser(displayName?: string): Promise<UserProfile> {
  const res = await axios.post<UserProfile>(`${API_BASE}/api/v1/users`, {
    display_name: displayName ?? null,
  });
  return res.data;
}

export async function getTrigger(userId: string): Promise<TriggerProfile | null> {
  const res = await axios.get<TriggerProfile | null>(
    `${API_BASE}/api/v1/users/${userId}/triggers`
  );
  return res.data;
}

export async function upsertTrigger(
  userId: string,
  rawText: string
): Promise<TriggerProfile> {
  const res = await axios.put<TriggerProfile>(
    `${API_BASE}/api/v1/users/${userId}/triggers`,
    { raw_text: rawText }
  );
  return res.data;
}
