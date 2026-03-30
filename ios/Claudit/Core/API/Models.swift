import Foundation

// MARK: - Session Types

struct ProjectGroup: Codable, Identifiable {
    var id: String { projectHash }
    let projectPath: String
    let projectHash: String
    let sessions: [SessionSummary]
}

struct SessionSummary: Codable, Identifiable {
    var id: String { sessionId }
    let sessionId: String
    let projectPath: String
    let projectHash: String
    let lastMessage: String
    let timestamp: Double
    let messageCount: Int
    let displayName: String?
    let status: SessionStatus
    let pinned: Bool?
    let isMayor: Bool?
    let slug: String?
    let slugPartCount: Int?
    let slugSessionIds: [String]?
}

enum SessionStatus: String, Codable {
    case idle
    case running
    case done
}

struct SessionDetail: Codable {
    let sessionId: String
    let projectPath: String
    let messages: [ParsedMessage]
    let slug: String?
}

struct MergedSessionDetail: Codable {
    let slug: String
    let projectPath: String
    let sessionIds: [String]
    let latestSessionId: String
    let messages: [ParsedMessage]
    let sessionBoundaries: [Int]
}

struct ParsedMessage: Codable, Identifiable {
    var id: String { uuid }
    let uuid: String
    let role: MessageRole
    let timestamp: String
    let content: [ContentBlock]
    let model: String?
    let messageId: String?
}

enum MessageRole: String, Codable {
    case user
    case assistant
}

// MARK: - Content Block

struct ContentBlock: Codable, Identifiable {
    let id: String
    let type: ContentBlockType
    let text: String?
    let name: String?
    let input: [String: AnyCodable]?
    let toolUseId: String?
    let content: ContentBlockContent?
    let thinking: String?

    enum CodingKeys: String, CodingKey {
        case type, text, name, input
        case toolUseId = "tool_use_id"
        case content, thinking
        case id
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Use 'id' from JSON if present, otherwise generate stable one
        self.id = (try? container.decode(String.self, forKey: .id)) ?? UUID().uuidString
        self.type = try container.decode(ContentBlockType.self, forKey: .type)
        self.text = try container.decodeIfPresent(String.self, forKey: .text)
        self.name = try container.decodeIfPresent(String.self, forKey: .name)
        self.input = try container.decodeIfPresent([String: AnyCodable].self, forKey: .input)
        self.toolUseId = try container.decodeIfPresent(String.self, forKey: .toolUseId)
        self.content = try container.decodeIfPresent(ContentBlockContent.self, forKey: .content)
        self.thinking = try container.decodeIfPresent(String.self, forKey: .thinking)
    }
}

enum ContentBlockType: String, Codable {
    case text
    case toolUse = "tool_use"
    case toolResult = "tool_result"
    case thinking
}

enum ContentBlockContent: Codable {
    case string(String)
    case blocks([ContentBlock])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            self = .string(str)
        } else if let blocks = try? container.decode([ContentBlock].self) {
            self = .blocks(blocks)
        } else {
            self = .string("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let str):
            try container.encode(str)
        case .blocks(let blocks):
            try container.encode(blocks)
        }
    }

    var text: String {
        switch self {
        case .string(let s): return s
        case .blocks(let blocks):
            return blocks.compactMap { $0.text }.joined(separator: "\n")
        }
    }
}

// MARK: - Task Types

enum TaskStatus: String, Codable, CaseIterable {
    case pending
    case running
    case waiting
    case draft
    case paused
    case done
    case failed
    case cancelled
}

struct ClauditTask: Codable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let prompt: String?
    let status: TaskStatus
    let createdBy: String
    let errorMessage: String?
    let order: Int
    let priority: Int?
    let parentId: String?
    let discoveredFrom: String?
    let blockedBy: [String]?
    let assignee: String?
    let projectId: String?
    let groupId: String?
    let sessionId: String?
    let sessionLabel: String?
    let worktreeId: String?
    let branch: String?
    let prUrl: String?
    let workingDir: String?
    let model: String?
    let permissionMode: String?
    let retryCount: Int
    let maxRetries: Int?
    let timeoutMs: Int?
    let taskType: String?
    let resultSummary: String?
    let resultPath: String?
    let filesChanged: [String]?
    let diffSummary: String?
    let tokenUsage: Int?
    let completionMode: String?
    let acceptanceCriteria: String?
    let tags: [String]?
    let createdAt: String
    let updatedAt: String
    let startedAt: String?
    let completedAt: String?
    let dueDate: String?
    // Subtasks included when fetching detail
    let subtasks: [ClauditTask]?

    enum CodingKeys: String, CodingKey {
        case id, title, description, prompt, status
        case createdBy = "created_by"
        case errorMessage, order, priority
        case parentId = "parent_id"
        case discoveredFrom = "discovered_from"
        case blockedBy = "blocked_by"
        case assignee, projectId, groupId, sessionId, sessionLabel
        case worktreeId, branch, prUrl, workingDir, model, permissionMode
        case retryCount, maxRetries, timeoutMs, taskType
        case resultSummary, resultPath, filesChanged, diffSummary
        case tokenUsage, completionMode, acceptanceCriteria, tags
        case createdAt, updatedAt, startedAt, completedAt, dueDate
        case subtasks
    }
}

// MARK: - Agent Types

struct Agent: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String?
    let specialty: String?
    let systemPrompt: String
    let recentSummary: String?
    let isSystem: Bool?
    let createdAt: String
    let updatedAt: String
    let lastActiveAt: String?
}

// MARK: - Dashboard Types

struct DashboardData: Codable {
    let running: Int
    let waiting: Int
    let doneToday: Int
    let failed: Int
    let tokenUsageToday: Int
    let recentTasks: [ClauditTask]
    let activeAgents: [ActiveAgent]
    let systemStatus: SystemStatus
}

struct ActiveAgent: Codable {
    let agent: Agent
    let runningSessions: Int
    let waitingSessions: Int
}

struct SystemStatus: Codable {
    let mayorOnline: Bool
    let mayorSessionId: String?
    let mayorProjectPath: String?
    let witnessRunning: Bool
    let witnessLastCheck: String
}

// MARK: - Cron Types

struct CronTask: Codable, Identifiable {
    let id: String
    let name: String
    let cronExpression: String
    let prompt: String
    let enabled: Bool
    let projectPath: String?
    let lastRun: String?
    let nextRun: String?
    let createdAt: String
}

// MARK: - AnyCodable helper

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let arr = try? container.decode([AnyCodable].self) {
            value = arr.map { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let str as String: try container.encode(str)
        case let int as Int: try container.encode(int)
        case let double as Double: try container.encode(double)
        case let bool as Bool: try container.encode(bool)
        default: try container.encodeNil()
        }
    }
}
