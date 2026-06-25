const zhCN = {
  // App
  app: { title: "Charming UI — AI 编程助手", shortTitle: "Charming" },

  // Sidebar
  sidebar: {
    search: "搜索会话...",
    noSessions: "暂无会话",
    noMatching: "无匹配会话",
    noSessionsForProject: "该项目下暂无会话",
    newChat: "新建聊天",
    settings: "设置",
    deleteSession: "删除会话",
    deleteConfirmTitle: "删除会话",
    deleteConfirmDesc: "确定要删除会话 \"{title}\" 吗？此操作不可撤销。",
    delete: "删除",
    version: "Charming UI v0.1.0",
  },

  // Project
  project: {
    select: "选择项目",
    noProjects: "暂无项目。\n添加一个项目开始使用。",
    addProject: "添加项目",
    deleteProject: "删除项目",
    createProject: "创建项目",
    projectDir: "项目目录",
    projectName: "项目名称",
    description: "描述（可选）",
    descriptionPlaceholder: "简短的描述...",
    cancel: "取消",
    scanResult: "扫描结果",
    nodeProject: "Node.js 项目",
    gitRepo: "Git 仓库",
    hasClaudeMd: "CLAUDE.md",
    nameRequired: "名称和路径不能为空",
    createFailed: "创建项目失败",
    deleteConfirm: '确定删除项目 "{name}"？',
  },

  // Header
  header: {
    streaming: "生成中",
    noModels: "无模型",
    connected: "已连接",
    active: "活跃",
  },

  // Chat
  chat: {
    welcome: "Claude Code 可视化界面",
    welcomeDesc: "开始与 Claude 对话。它可以读写文件、运行终端命令、搜索网页等。",
    suggestions: [
      "解释这个代码库",
      "重构认证模块",
      "编写单元测试",
      "修复 parser.ts 中的 bug",
    ],
    thinking: "思考中",
    claudeThinking: "Claude 正在思考...",
    you: "你",
    claude: "Claude",
    send: "发送消息",
    stop: "停止生成",
    placeholder: "给 Claude 发送消息...",
    hint: "Claude 可以读取文件、运行命令和搜索网页。",
    hintKeys: "Enter 发送，Shift+Enter 换行。",
    attach: "添加附件",
    copyCode: "复制代码",
    editingMessage: "正在编辑消息...",
    cancelEdit: "取消编辑",
  },

  // Tool calls
  tool: {
    parameters: "参数",
    result: "结果",
    error: "错误",
  },

  // Permissions
  permission: {
    title: "权限请求",
    subtitle: "Claude 想要执行工具",
    tool: "工具",
    params: "参数",
    allow: "允许",
    deny: "拒绝",
  },

  // Settings
  settings: {
    title: "设置",
    general: "通用",
    providers: "提供商",
    apiKey: "API Key",
    permissions: "权限",
    mcpServers: "MCP 服务器",
    appearance: "外观",
    defaultModel: "默认模型",
    permissionMode: "权限模式",
    autoApproveTools: "自动批准工具",
    autoApproveToolsHint: "逗号分隔的工具名，跳过确认（例如：Read, Glob）",
    language: "语言",
    models: "个模型",
    enabled: "启用",
    apiKeyPlaceholder: "输入 API Key...",
    baseUrl: "API 基础 URL",
    baseUrlHint: "支持 OpenRouter、DeepSeek、Azure 等",
    addProvider: "添加自定义提供商",
    noMcpServers: "暂无 MCP 服务器配置。",
    addMcp: "+ 添加 MCP 服务器",
    save: "保存",
    providersDesc: "配置 LLM 提供商及其 API Key。已启用的提供商的模型将显示在顶部栏中。",
    apiLegacyTitle: "Anthropic API Key（旧版）",
    apiLegacyDesc: "快速设置默认 Anthropic API Key。如需多提供商设置，请使用提供商选项卡。",
    apiEnvHint: "您也可以通过 ANTHROPIC_API_KEY 环境变量设置。",
    permissionsDesc: "配置 Claude 无需询问即可使用的工具。",
    mcpDesc: "MCP（模型上下文协议）服务器为 Claude 提供额外的工具和资源。",
    customProvider: "自定义提供商",
    claudeSdkBadge: "Claude SDK",
    openaiApiBadge: "OpenAI API",
    costPerM: "每百万",
    fetchModels: "获取模型列表",
    fetchModelsHint: "从提供商 API 自动获取可用模型",
    fetchingModels: "获取中...",
    modelFetchFailed: "获取模型列表失败。请检查 URL 和 API Key。",
    modelFetchSuccess: "获取到 {count} 个模型",
    checkBalance: "查询余额",
    checkingBalance: "查询中...",
    balanceFetchFailed: "查询余额失败",
    balance: "余额",
    granted: "赠送",
    toppedUp: "充值",
    notAvailable: "不可用",
    spendingLimit: "费用限额",
    noLimit: "不限制",
    perQuery: "/次查询",
    spendingLimitHint: "达到限额后 Claude 将自动停止。留空表示不限制。",
    systemPrompt: "系统提示词",
    systemPromptHint: "自定义 Claude 的行为指令（例如：“始终用中文回复”、“详细解释代码逻辑”）",
    systemPromptDesc: "附加到 Claude Code 默认系统提示词之后。留空使用默认设置。",

    // 上下文压缩
    compression: "上下文压缩",
    compressionDesc: "当对话接近模型上下文限制时，自动总结较早的消息，防止截断。",
    compressionEnabled: "启用压缩",
    compressionContextWindow: "上下文窗口 (tokens)",
    compressionContextWindowHint: "0 = 使用模型默认值。通常：128K（GPT-4o）、200K（Claude）",
    compressionThreshold: "触发阈值 (%)",
    compressionThresholdHint: "上下文使用率达到此百分比时自动压缩（如 75 = 75%）",
    compressionKeepRecent: "保留最近消息",
    compressionKeepRecentHint: "压缩时保留最近 N 条消息不作总结",
  },

  // Command palette
  commandPalette: {
    newChat: "新建对话",
    newChatDesc: "创建一个新的聊天会话",
    darkTheme: "切换深色主题",
    lightTheme: "切换浅色主题",
    themeDesc: "在深色和浅色主题之间切换",
    settingsDesc: "打开设置面板",
    copyLastReply: "复制最后一条回复",
    copyLastReplyDesc: "将最后一条助手回复复制到剪贴板",
    clearChat: "清空对话",
    clearChatDesc: "清除当前会话中的所有消息",
    clearChatConfirmTitle: "清空当前对话",
    clearChatConfirmDesc: "确定要清除当前会话中的所有消息吗？此操作不可撤销。",
    toggleFiles: "切换文件面板",
    toggleFilesDesc: "显示或隐藏文件资源管理器",
    toggleTerminal: "切换终端",
    toggleTerminalDesc: "显示或隐藏集成终端",
  },

  // Models
  models: {
    claude_sonnet: "Claude Sonnet 4.5",
    claude_opus: "Claude Opus 4.8",
    claude_haiku: "Claude Haiku 4.5",
    claude_fable: "Claude Fable 5",
    gpt4o: "GPT-4o",
    gpt4o_mini: "GPT-4o Mini",
  },

  // Theme
  theme: {
    dark: "暗色",
    light: "亮色",
    system: "系统",
  },

  // Permission modes
  permMode: {
    default: "默认（写入前询问）",
    acceptEdits: "接受编辑",
    bypassPermissions: "绕过所有",
    plan: "计划模式",
  },

  // Session
  session: {
    newChat: "新聊天",
    justNow: "刚刚",
    minsAgo: "分钟前",
    hoursAgo: "小时前",
    daysAgo: "天前",
  },

  // Export
  export: {
    exportChat: "导出对话",
    exportDesc: "将当前对话下载为 Markdown 或 JSON",
    exportFailed: "导出失败",
    downloadMarkdown: "下载 Markdown",
    downloadJson: "下载 JSON",
  },

  // Full-text search
  search: {
    searchMessages: "搜索消息",
    searchDesc: "在所有会话中搜索消息内容",
    searchPlaceholder: "搜索消息内容...",
    noResults: "未找到 \"{query}\" 的相关结果",
    searching: "搜索中...",
    matchesIn: "{title} 中找到 {count} 条匹配",
    enterToOpen: "Enter 打开会话",
  },

  // Errors
  error: {
    serverError: "服务器错误",
    unknownError: "未知错误",
    noApiKey: '提供商 "{provider}" 未配置 API Key。请在设置中配置。',
    noModel: '提供商 "{provider}" 未配置模型。',
    unknownProvider: "未知的提供商类型",
  },
};

export default zhCN;
export type Locale = typeof zhCN;
