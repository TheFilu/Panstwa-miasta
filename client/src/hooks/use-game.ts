import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import {
  type CreateRoomRequest,
  type JoinRoomRequest,
  type SubmitAnswersRequest,
} from "@shared/schema";
import { useLocation } from "wouter";
import { queryClient as libQueryClient } from "../lib/queryClient";

export const queryClient = libQueryClient;

// Session storage helper
const STORAGE_KEY = "panstwo_miasto_session";

interface Session {
  code: string;
  playerId: number;
  token: string;
  name: string;
}

export function getSession(): Session | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  return JSON.parse(stored);
}

export function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function useRoom(code: string | undefined) {
  return useQuery({
    queryKey: [api.rooms.get.path, code],
    queryFn: async () => {
      if (!code) return null;
      const url = buildUrl(api.rooms.get.path, { code });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch room");
      return api.rooms.get.responses[200].parse(await res.json());
    },
    enabled: !!code,
    refetchInterval: 1000, // Poll every 1 second for live updates
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateRoom() {
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (data: CreateRoomRequest) => {
      const res = await fetch(api.rooms.create.path, {
        method: api.rooms.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.rooms.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create room");
      }

      return api.rooms.create.responses[201].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      saveSession({
        code: data.code,
        playerId: data.playerId,
        token: data.token,
        name: variables.playerName,
      });
      setLocation(`/room/${data.code}`);
    },
  });
}

export function useJoinRoom() {
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (data: JoinRoomRequest) => {
      const res = await fetch(api.rooms.join.path, {
        method: api.rooms.join.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 404) throw new Error("Room not found");
        if (res.status === 409)
          throw new Error("Game already started or name taken");
        throw new Error("Failed to join room");
      }

      return api.rooms.join.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      saveSession({
        code: data.code,
        playerId: data.playerId,
        token: data.token,
        name: variables.playerName,
      });
      setLocation(`/room/${data.code}`);
    },
  });
}

export function useStartGame() {
  return useMutation({
    mutationFn: async (code: string) => {
      const url = buildUrl(api.rooms.start.path, { code });
      const res = await fetch(url, {
        method: api.rooms.start.method,
      });

      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ message: "Failed to start game" }));
        throw new Error(error.message);
      }

      return api.rooms.start.responses[200].parse(await res.json());
    },
    onSuccess: (_, code) => {
      libQueryClient.invalidateQueries({
        queryKey: [api.rooms.get.path, code],
      });
    },
  });
}

export function useSubmitAnswers() {
  return useMutation({
    mutationFn: async ({
      code,
      answers,
    }: { code: string } & SubmitAnswersRequest) => {
      const session = getSession();
      if (!session) throw new Error("No session found");

      const url = buildUrl(api.rooms.submit.path, { code });
      const res = await fetch(url, {
        method: api.rooms.submit.method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": String(session.playerId)
        },
        body: JSON.stringify({ answers }),
      });

      if (!res.ok) throw new Error("Failed to submit answers");
      return api.rooms.submit.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      libQueryClient.invalidateQueries({
        queryKey: [api.rooms.get.path, variables.code],
      });
    },
  });
}

export function useUpdateCategories() {
  return useMutation({
    mutationFn: async ({
      code,
      categories,
    }: {
      code: string;
      categories: string[];
    }) => {
      const url = buildUrl(api.rooms.updateCategories.path, { code });
      const res = await fetch(url, {
        method: api.rooms.updateCategories.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
      });

      if (!res.ok) throw new Error("Failed to update categories");
      return api.rooms.updateCategories.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      libQueryClient.invalidateQueries({
        queryKey: [api.rooms.get.path, variables.code],
      });
    },
  });
}

export function useUpdateSettings() {
  return useMutation({
    mutationFn: async ({
      code,
      settings,
    }: {
      code: string;
      settings: { totalRounds?: number; timerDuration?: number | null };
    }) => {
      const url = buildUrl(api.rooms.updateSettings.path, { code });
      const res = await fetch(url, {
        method: api.rooms.updateSettings.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error("Failed to update settings");
      return api.rooms.updateSettings.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      libQueryClient.invalidateQueries({
        queryKey: [api.rooms.get.path, variables.code],
      });
    },
  });
}
