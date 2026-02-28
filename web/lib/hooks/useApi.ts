import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import * as api from "../api";
import { UserData, RatingUser, Module, ModuleDetails, LessonDetails } from "@/types";

// User data hook
export function useUserData() {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useQuery({
    queryKey: ["userData", email],
    queryFn: async () => {
      if (!email) return null;
      const result = await api.getUserData(email);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!email,
    staleTime: 10 * 1000, // 10 seconds
  });
}

// Rating hook
export function useRating(limit: number = 50, league?: string) {
  return useQuery({
    queryKey: ["rating", limit, league],
    queryFn: async () => {
      const result = await api.getRating(limit, league);
      if (result.error) throw new Error(result.error);
      return result.data || [];
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Modules map hook
export function useModulesMap() {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useQuery({
    queryKey: ["modulesMap", email],
    queryFn: async () => {
      const result = await api.getModulesMap(email || undefined);
      if (result.error) throw new Error(result.error);
      return result.data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Module details hook
export function useModuleDetails(moduleId: number) {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useQuery({
    queryKey: ["moduleDetails", moduleId, email],
    queryFn: async () => {
      const result = await api.getModuleDetails(moduleId, email || undefined);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!moduleId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Lesson details hook
export function useLessonDetails(lessonId: number) {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useQuery({
    queryKey: ["lessonDetails", lessonId, email],
    queryFn: async () => {
      const result = await api.getLessonDetails(lessonId, email || undefined);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!lessonId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Update nickname mutation with optimistic updates
export function useUpdateNickname() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useMutation({
    mutationFn: async (nickname: string) => {
      if (!email) throw new Error("Not authenticated");
      const result = await api.updateNickname(email, nickname);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (newNickname) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["userData", email] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<UserData>(["userData", email]);

      // Optimistically update
      if (previousData) {
        queryClient.setQueryData<UserData>(["userData", email], {
          ...previousData,
          nickname: newNickname,
        });
      }

      return { previousData };
    },
    onError: (err, newNickname, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["userData", email], context.previousData);
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ["userData", email] });
    },
  });
}

// Check task answer mutation with optimistic updates
export function useCheckTaskAnswer() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const email = session?.user?.email;

  return useMutation({
    mutationFn: async ({ taskId, answer }: { taskId: number; answer: string }) => {
      if (!email) throw new Error("Not authenticated");
      const result = await api.checkTaskAnswer(taskId, answer, email);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      // Invalidate user data and modules map to refresh progress
      queryClient.invalidateQueries({ queryKey: ["userData", email] });
      queryClient.invalidateQueries({ queryKey: ["modulesMap", email] });
      queryClient.invalidateQueries({ queryKey: ["rating"] });
    },
  });
}

