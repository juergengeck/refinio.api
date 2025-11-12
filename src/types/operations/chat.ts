/**
 * Chat Operation Type Definitions
 *
 * TypeScript types for chat-related operations.
 * Type safety is enforced at compile time - no runtime validation needed.
 * Transports (IPC, HTTP) are trusted and TypeScript ensures type correctness.
 */

// ============================================================================
// chat:exportHistory - Export topic history in various formats
// ============================================================================

/**
 * Export history request
 */
export interface ExportHistoryRequest {
  /** SHA256IdHash<Topic> */
  topicId: string;
  /** Export format */
  format: 'json' | 'markdown' | 'html';
}

/**
 * Export history response
 */
export interface ExportHistoryResponse {
  /** Exported content as string */
  data: string;
  /** Suggested filename with extension */
  filename: string;
}

// ============================================================================
// chat:sendMessage - Send a message to a topic
// ============================================================================

/**
 * Send message request
 */
export interface SendMessageRequest {
  /** SHA256IdHash<Topic> */
  topicId: string;
  /** Message content (non-empty) */
  content: string;
  /** Array of SHA256Hash<BLOB> */
  attachments?: string[];
}

/**
 * Send message response
 */
export interface SendMessageResponse {
  /** SHA256IdHash<Message> */
  messageId: string;
  /** Unix timestamp (ms) */
  timestamp: number;
}

// ============================================================================
// chat:getHistory - Get message history for a topic
// ============================================================================

/**
 * Get history request
 */
export interface GetHistoryRequest {
  /** SHA256IdHash<Topic> */
  topicId: string;
  /** Limit (1-200, default 50) */
  limit?: number;
  /** Cursor for pagination (SHA256IdHash<Message>) */
  before?: string;
}

/**
 * Message in history response
 */
export interface HistoryMessage {
  /** SHA256IdHash<Message> */
  messageId: string;
  content: string;
  /** SHA256IdHash<Person> */
  author: string;
  timestamp: number;
  attachments?: string[];
}

/**
 * Get history response
 */
export interface GetHistoryResponse {
  messages: HistoryMessage[];
  hasMore: boolean;
  /** Cursor for next page */
  nextCursor?: string;
}
