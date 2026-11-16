/* Tasks, Calendar & Reminders types (doc 27) — DTOs over crm_tasks,
   projects, platform_reminders, platform_calendars,
   platform_calendar_events, user_notifications,
   platform_announcements, platform_chat_*, platform_record_followers. */

export interface Task {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  priority: string;
  status: string;
  boardColumn: string | null;
  dueAt: string | null;
  startAt: string | null;
  allDay: boolean;
  assignedTo: string | null;
  createdBy: string | null;
  customerId: string | null;
  leadId: string | null;
  relatedType: string | null;
  relatedId: string | null;
  parentTaskId: string | null;
  tags: string[];
  remindBeforeMinutes: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  ownerId: string | null;
  collectionId: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  relatedType: string | null;
  relatedId: string | null;
  remindAt: string;
  message: string;
  url: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface Calendar {
  id: string;
  name: string;
  color: string | null;
  timezone: string;
  visibility: string;
  staffId: string | null;
  blocksAvailability: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: string;
  relatedType: string | null;
  relatedId: string | null;
  meetingUrl: string | null;
  createdBy: string | null;
}

export interface UserNotification {
  id: string;
  userId: string;
  notificationType: string;
  title: string;
  body: string | null;
  priority: string;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdBy: string | null;
}

export interface ChatThread {
  id: string;
  kind: string;
  title: string | null;
  relatedType: string | null;
  relatedId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string | null;
  body: string | null;
  createdAt: string;
}

export interface Follower {
  id: string;
  userId: string;
  relatedType: string;
  relatedId: string;
  reason: string;
  createdAt: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toTask(r: Row): Task {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    description: str(r.description),
    taskType: String(r.task_type || 'follow_up'),
    priority: String(r.priority || 'medium'),
    status: String(r.status || 'open'),
    boardColumn: str(r.board_column),
    dueAt: str(r.due_at),
    startAt: str(r.start_at),
    allDay: Boolean(r.all_day),
    assignedTo: str(r.assigned_to),
    createdBy: str(r.created_by),
    customerId: str(r.customer_id),
    leadId: str(r.lead_id),
    relatedType: str(r.related_type),
    relatedId: str(r.related_id),
    parentTaskId: str(r.parent_task_id),
    tags: arr(r.tags),
    remindBeforeMinutes: num(r.remind_before_minutes),
    completedAt: str(r.completed_at),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function toProject(r: Row): Project {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    status: String(r.status || 'active'),
    ownerId: str(r.owner_id),
    collectionId: str(r.collection_id),
    createdAt: String(r.created_at || ''),
  };
}

export function toReminder(r: Row): Reminder {
  return {
    id: String(r.id),
    userId: String(r.user_id || ''),
    relatedType: str(r.related_type),
    relatedId: str(r.related_id),
    remindAt: String(r.remind_at || ''),
    message: String(r.message || ''),
    url: str(r.url),
    status: String(r.status || 'pending'),
    sentAt: str(r.sent_at),
    createdAt: String(r.created_at || ''),
  };
}

export function toCalendar(r: Row): Calendar {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    color: str(r.color),
    timezone: String(r.timezone || 'America/Chicago'),
    visibility: String(r.visibility || 'team'),
    staffId: str(r.staff_id),
    blocksAvailability: Boolean(r.blocks_availability),
  };
}

export function toCalendarEvent(r: Row): CalendarEvent {
  return {
    id: String(r.id),
    calendarId: String(r.calendar_id || ''),
    title: String(r.title || ''),
    description: str(r.description),
    location: str(r.location),
    startsAt: String(r.starts_at || ''),
    endsAt: String(r.ends_at || ''),
    allDay: Boolean(r.all_day),
    status: String(r.status || 'confirmed'),
    relatedType: str(r.related_type),
    relatedId: str(r.related_id),
    meetingUrl: str(r.meeting_url),
    createdBy: str(r.created_by),
  };
}

export function toNotification(r: Row): UserNotification {
  return {
    id: String(r.id),
    userId: String(r.user_id || ''),
    notificationType: String(r.notification_type || ''),
    title: String(r.title || ''),
    body: str(r.body),
    priority: String(r.priority || 'normal'),
    isRead: Boolean(r.is_read),
    actionUrl: str(r.action_url),
    createdAt: String(r.created_at || ''),
  };
}

export function toAnnouncement(r: Row): Announcement {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    body: String(r.body || ''),
    audience: String(r.audience || 'all'),
    isPinned: Boolean(r.is_pinned),
    publishedAt: String(r.published_at || ''),
    expiresAt: str(r.expires_at),
    createdBy: str(r.created_by),
  };
}

export function toChatThread(r: Row): ChatThread {
  return {
    id: String(r.id),
    kind: String(r.kind || 'group'),
    title: str(r.title),
    relatedType: str(r.related_type),
    relatedId: str(r.related_id),
    lastMessageAt: str(r.last_message_at),
    createdAt: String(r.created_at || ''),
  };
}

export function toChatMessage(r: Row): ChatMessage {
  return {
    id: String(r.id),
    threadId: String(r.thread_id || ''),
    authorId: str(r.author_id),
    body: str(r.body),
    createdAt: String(r.created_at || ''),
  };
}

export function toFollower(r: Row): Follower {
  return {
    id: String(r.id),
    userId: String(r.user_id || ''),
    relatedType: String(r.related_type || ''),
    relatedId: String(r.related_id || ''),
    reason: String(r.reason || ''),
    createdAt: String(r.created_at || ''),
  };
}
