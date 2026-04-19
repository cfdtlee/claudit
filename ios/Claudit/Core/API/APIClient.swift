import Foundation

/// API client that proxies REST requests through the relay tunnel.
@Observable
final class APIClient {
    private let tunnel: TunnelProtocol
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    init(tunnel: TunnelProtocol) {
        self.tunnel = tunnel
    }

    // MARK: - Generic Request

    func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        var bodyJSON: String?
        if let body {
            let data = try JSONEncoder().encode(body)
            bodyJSON = String(data: data, encoding: .utf8)
        }

        let response = try await tunnel.apiRequest(
            method: method,
            path: path,
            body: bodyJSON
        )

        guard response.status >= 200 && response.status < 300 else {
            throw TunnelError.serverError(response.status, response.body)
        }

        guard let responseData = response.body.data(using: .utf8) else {
            throw APIError.invalidResponse
        }

        return try decoder.decode(T.self, from: responseData)
    }

    /// Fire-and-forget request (no response body needed).
    func request(
        _ method: String,
        _ path: String,
        body: (any Encodable)? = nil
    ) async throws {
        var bodyJSON: String?
        if let body {
            let data = try JSONEncoder().encode(body)
            bodyJSON = String(data: data, encoding: .utf8)
        }

        let response = try await tunnel.apiRequest(
            method: method,
            path: path,
            body: bodyJSON
        )

        guard response.status >= 200 && response.status < 300 else {
            throw TunnelError.serverError(response.status, response.body)
        }
    }

    // MARK: - Sessions

    func fetchSessions(query: String? = nil, hideEmpty: Bool = true) async throws -> [ProjectGroup] {
        var path = "/api/sessions?hideEmpty=\(hideEmpty)"
        if let q = query, !q.isEmpty {
            path += "&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)"
        }
        return try await request("GET", path)
    }

    func fetchSessionDetail(
        projectHash: String,
        sessionId: String
    ) async throws -> SessionDetail {
        // Use raw request to truncate messages before full decode
        var bodyJSON: String? = nil
        let response = try await tunnel.apiRequest(method: "GET", path: "/api/sessions/\(projectHash)/\(sessionId)", body: bodyJSON)
        guard response.status >= 200 && response.status < 300 else {
            throw TunnelError.serverError(response.status, response.body)
        }
        guard var responseData = response.body.data(using: .utf8) else {
            throw APIError.invalidResponse
        }

        // Truncate messages array in raw JSON to last 100 for faster decode
        if responseData.count > 100_000,
           var obj = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any],
           let messages = obj["messages"] as? [[String: Any]], messages.count > 100 {
            obj["messages"] = Array(messages.suffix(100))
            responseData = try JSONSerialization.data(withJSONObject: obj)
        }

        return try decoder.decode(SessionDetail.self, from: responseData)
    }

    func fetchMergedSession(
        projectHash: String,
        slug: String
    ) async throws -> MergedSessionDetail {
        return try await request("GET", "/api/sessions/merged/\(projectHash)/\(slug)")
    }

    func pinSession(sessionId: String, pinned: Bool) async throws {
        let body = ["pinned": pinned]
        try await request("PATCH", "/api/sessions/\(sessionId)/pin", body: body)
    }

    func archiveSession(sessionId: String, archived: Bool) async throws {
        let body = ["archived": archived]
        try await request("PATCH", "/api/sessions/\(sessionId)/archive", body: body)
    }

    func deleteSession(projectHash: String, sessionId: String) async throws {
        try await request("DELETE", "/api/sessions/\(projectHash)/\(sessionId)")
    }

    // MARK: - Tasks

    func fetchTasks(
        status: TaskStatus? = nil,
        projectId: String? = nil,
        assignee: String? = nil
    ) async throws -> [ClauditTask] {
        var path = "/api/tasks?"
        if let s = status { path += "status=\(s.rawValue)&" }
        if let p = projectId { path += "projectId=\(p)&" }
        if let a = assignee { path += "assignee=\(a)&" }
        return try await request("GET", path)
    }

    func fetchTask(id: String) async throws -> ClauditTask {
        return try await request("GET", "/api/tasks/\(id)")
    }

    func createTask(title: String, description: String? = nil, prompt: String? = nil) async throws -> ClauditTask {
        struct Body: Encodable {
            let title: String
            let description: String?
            let prompt: String?
            let status = "pending"
            let created_by = "ios_app"
        }
        return try await request("POST", "/api/tasks", body: Body(
            title: title, description: description, prompt: prompt
        ))
    }

    func updateTaskStatus(id: String, status: TaskStatus) async throws -> ClauditTask {
        struct Body: Encodable { let status: String }
        return try await request("PATCH", "/api/tasks/\(id)/status", body: Body(status: status.rawValue))
    }

    func deleteTask(id: String) async throws {
        try await request("DELETE", "/api/tasks/\(id)")
    }

    // MARK: - Dashboard

    func fetchDashboard() async throws -> DashboardData {
        return try await request("GET", "/api/dashboard")
    }

    // MARK: - Agents

    func fetchAgents() async throws -> [Agent] {
        return try await request("GET", "/api/agents")
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case notConnected

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid response from server"
        case .notConnected: return "Not connected to server"
        }
    }
}
