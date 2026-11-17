'use client';
/* useTasksApi — client data layer for Tasks, Calendar & Reminders
   (doc 27). Tasks ride /api/crm/tasks (+ create through the
   platform_create_task RPC route /api/tasks); everything else rides
   /api/tasks/*. */
import { useCallback, useEffect, useState } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';
import { toTask, toProject, toReminder, toCalendar, toCalendarEvent, toNotification, toAnnouncement, toChatThread, toChatMessage, toFollower } from '@/lib/taskTypes';
import type { Task, Project, Reminder, Calendar, CalendarEvent, UserNotification, Announcement, ChatThread, ChatMessage, Follower } from '@/lib/taskTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

export function useTasks() {
  const { data, loaded, error, refresh, setData } = useList<Task>(
    'crmTasksAll',
    '/api/crm/tasks',
    (raw) => (((raw as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[]).map(toTask),
  );
  return { tasks: data, loading: !loaded, error, refresh, setTasks: setData };
}

export function useProjects() {
  const { data, loaded, refresh } = useList<Project>('taskProjects', '/api/tasks/projects', (raw) => ((raw as { data?: Project[] })?.data ?? []) as Project[]);
  return { projects: data, loading: !loaded, refresh };
}

export const taskMutations = {
  /** Create through the registry RPC route, then apply the board
      fields the RPC does not carry (assignee, tags). */
  create: async (input: {
    title: string;
    description?: string;
    dueAt?: string | null;
    priority?: string;
    taskType?: string;
    boardColumn?: string;
    relatedType?: string | null;
    relatedId?: string | null;
    assignedTo?: string | null;
    tags?: string[];
  }): Promise<MutationResult<Task>> => {
    const res = await call<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        dueAt: input.dueAt,
        priority: input.priority,
        taskType: input.taskType,
        boardColumn: input.boardColumn,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      }),
    });
    if (!res.ok || !res.data) return res as MutationResult<Task>;
    const extras: Record<string, unknown> = {};
    if (input.assignedTo) extras.assigned_to = input.assignedTo;
    if (input.tags?.length) extras.tags = input.tags;
    if (Object.keys(extras).length) {
      await call(`/api/crm/tasks/${res.data.id}`, { method: 'PATCH', body: JSON.stringify(extras) });
      return { ok: true, data: { ...res.data, assignedTo: input.assignedTo ?? res.data.assignedTo, tags: input.tags ?? res.data.tags } };
    }
    return res as MutationResult<Task>;
  },
  patch: (id: string, patch: Record<string, unknown>) =>
    call<Record<string, unknown>>(`/api/crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) =>
    call<{ id: string; deleted: boolean }>(`/api/crm/tasks/${id}`, { method: 'DELETE' }),
  createProject: (name: string) =>
    call<Project>('/api/tasks/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  inviteMember: (input: { display_name: string; email: string; role: string }) =>
    call<{ id: string; display_name: string; role: string | null; email: string | null }>('/api/crm/staff', { method: 'POST', body: JSON.stringify(input) }),
};

export function useReminders() {
  const { data, loaded, refresh } = useList<Reminder>('platformReminders', '/api/tasks/reminders', (raw) => ((raw as { data?: Reminder[] })?.data ?? []) as Reminder[]);
  return { reminders: data, loading: !loaded, refresh };
}

export const reminderMutations = {
  create: (input: { message: string; remindAt: string; relatedType?: string; relatedId?: string }) =>
    call<Reminder>('/api/tasks/reminders', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: string) => call(`/api/tasks/reminders?id=${id}`, { method: 'DELETE' }),
};

export function useCalendars() {
  const { data, loaded, refresh } = useList<Calendar>('platformCalendars', '/api/tasks/calendars', (raw) => ((raw as { data?: Calendar[] })?.data ?? []) as Calendar[]);
  return { calendars: data, loading: !loaded, refresh };
}

export function useCalendarEvents() {
  const { data, loaded, refresh } = useList<CalendarEvent>('platformCalEvents', '/api/tasks/events', (raw) => ((raw as { data?: CalendarEvent[] })?.data ?? []) as CalendarEvent[]);
  return { events: data, loading: !loaded, refresh };
}

export const calendarMutations = {
  createCalendar: (name: string) => call<Calendar>('/api/tasks/calendars', { method: 'POST', body: JSON.stringify({ name }) }),
  createEvent: (input: Record<string, unknown>) => call<CalendarEvent>('/api/tasks/events', { method: 'POST', body: JSON.stringify(input) }),
  removeEvent: (id: string) => call(`/api/tasks/events?id=${id}`, { method: 'DELETE' }),
};

export function useNotifications() {
  const { data, loaded, refresh, setData } = useList<UserNotification>('userNotifications', '/api/tasks/notifications', (raw) => ((raw as { data?: UserNotification[] })?.data ?? []) as UserNotification[]);
  return { notifications: data, loading: !loaded, refresh, setNotifications: setData };
}

export const notificationMutations = {
  markRead: (id: string) => call('/api/tasks/notifications', { method: 'PATCH', body: JSON.stringify({ id, isRead: true }) }),
  markAllRead: () => call('/api/tasks/notifications', { method: 'PATCH', body: JSON.stringify({ all: true }) }),
};

export function useAnnouncements() {
  const { data, loaded, refresh } = useList<Announcement & { readByMe?: boolean }>('platformAnnouncements', '/api/tasks/announcements', (raw) => ((raw as { data?: (Announcement & { readByMe?: boolean })[] })?.data ?? []) as (Announcement & { readByMe?: boolean })[]);
  return { announcements: data, loading: !loaded, refresh };
}

export const announcementMutations = {
  create: (input: { title: string; body: string; audience?: string; isPinned?: boolean }) =>
    call<Announcement>('/api/tasks/announcements', { method: 'POST', body: JSON.stringify(input) }),
  markRead: (announcementId: string) =>
    call('/api/tasks/announcements', { method: 'POST', body: JSON.stringify({ action: 'mark_read', announcementId }) }),
};

export function useFollowing() {
  const { data, loaded, refresh } = useList<Follower>('recordFollowers', '/api/tasks/following', (raw) => ((raw as { data?: Follower[] })?.data ?? []) as Follower[]);
  return { following: data, loading: !loaded, refresh };
}

export const followMutations = {
  follow: (relatedType: string, relatedId: string, reason?: string) =>
    call<Follower>('/api/tasks/following', { method: 'POST', body: JSON.stringify({ relatedType, relatedId, reason }) }),
  unfollow: (id: string) => call(`/api/tasks/following?id=${id}`, { method: 'DELETE' }),
};

export function useChatThreads() {
  const { data, loaded, refresh } = useList<ChatThread>('chatThreads', '/api/tasks/chat/threads', (raw) => ((raw as { data?: ChatThread[] })?.data ?? []) as ChatThread[]);
  return { threads: data, loading: !loaded, refresh };
}

export function useChatMessages(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const refresh = useCallback(async () => {
    if (!threadId) { setMessages([]); return; }
    const res = await fetchJson<{ data: Record<string, unknown>[] }>(`/api/tasks/chat/messages?threadId=${threadId}`);
    if (res.ok) setMessages((res.data.data || []).map(toChatMessage));
  }, [threadId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { messages, setMessages, refresh };
}

export const chatMutations = {
  createThread: (input: { title?: string; kind?: string }) =>
    call<ChatThread>('/api/tasks/chat/threads', { method: 'POST', body: JSON.stringify(input) }),
  sendMessage: (threadId: string, body: string) =>
    call<ChatMessage>('/api/tasks/chat/messages', { method: 'POST', body: JSON.stringify({ threadId, body }) }),
};

export type { Task, Project, Reminder, Calendar, CalendarEvent, UserNotification, Announcement, ChatThread, ChatMessage, Follower };
