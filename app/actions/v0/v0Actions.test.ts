import {
  generateV0Text,
  createProjectFromV0Output,
  createGithubRepoAndPush,
} from "./v0Actions";
import { generateText } from "ai";
import { vercel } from "@ai-sdk/vercel";
import { scrapeAndAnalyzeWebsite } from "app/actions/scraper/scraperActions";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Octokit } from "octokit";

// Mock external modules
jest.mock("@ai-sdk/vercel", () => ({
  vercel: jest.fn(() => "mocked-vercel-model"),
}));

jest.mock("ai", () => ({
  generateText: jest.fn(),
}));

jest.mock("app/actions/scraper/scraperActions", () => ({
  scrapeAndAnalyzeWebsite: jest.fn(),
}));

jest.mock("fs");
jest.mock("path");
jest.mock("child_process");
jest.mock("octokit");

// Copied parseV0Output function from v0Actions.ts for testing, as it's not exported.
function parseV0Output(
  v0ApiOutput: string
): { filePath: string; content: string }[] {
  const files: { filePath: string; content: string }[] = [];
  const regex = /```(\w+)?\s*file="([^"]+)"\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(v0ApiOutput)) !== null) {
    if (match[2] && match[3]) {
      files.push({
        filePath: match[2].trim(),
        content: match[3].trim(),
      });
    }
  }
  return files;
}

describe("generateV0Text", () => {
  const originalApiKey = process.env.V0_API_KEY;
  const mockProjectDescription = "A cool new project";
  const mockUrl = "https://example.com";
  const mockWorkspaceId = "ws-123";
  const mockSiteConfig = {
    title: "Mock Site",
    description: "This is a mocked site configuration.",
    theme: { primaryColor: "blue" },
  };
  const mockGeneratedText = "Generated project code text";

  beforeEach(() => {
    (generateText as jest.Mock).mockReset();
    (scrapeAndAnalyzeWebsite as jest.Mock).mockReset();
    (vercel as jest.Mock).mockClear(); // Clear any previous calls to vercel
    process.env.V0_API_KEY = "test-api-key";
  });

  afterAll(() => {
    process.env.V0_API_KEY = originalApiKey;
  });

  it("should successfully generate text with scraped site config", async () => {
    (scrapeAndAnalyzeWebsite as jest.Mock).mockResolvedValue(mockSiteConfig);
    (generateText as jest.Mock).mockResolvedValue({ text: mockGeneratedText });

    const result = await generateV0Text({
      projectDescription: mockProjectDescription,
      url: mockUrl,
      workspaceId: mockWorkspaceId,
    });

    expect(scrapeAndAnalyzeWebsite).toHaveBeenCalledWith(
      mockUrl,
      mockWorkspaceId
    );

    const siteConfigJsonString = JSON.stringify(mockSiteConfig, null, 2);
    const baseTemplate = `Develop a Next.js website that dynamically renders content based on a JSON configuration file. The website should feature a \`site.config\` file to manage site-wide parameters. The JSON response will provide the data to populate various components. The website should be designed to be responsive and accessible, ensuring a seamless user experience across different devices and browsers. The \`site.config\` file should include parameters such as site title, description, and any other global settings. The website should parse the JSON data and use it to render the necessary components, such as navigation, content sections, and footers. The design should be clean and modern, with a focus on usability and readability. The website should handle potential errors gracefully, providing informative messages to the user if any issues arise during data fetching or rendering. The JSON response will contain the data for the website's content, including text, images, and links. The website should be able to update the content dynamically without requiring code changes. The website should follow best practices for SEO, including proper use of meta tags and semantic HTML. The website should be deployed on Vercel.`;
    const siteConfigIntegration = `Here is the JSON data (SiteConfig) to be used for the website's content and configuration:\n${siteConfigJsonString}`;
    const userCustomization = `Additional project requirements or focus areas:\n${mockProjectDescription}`;
    const outputFormatInstruction = `Ensure the output is a complete Next.js project structure (files and folders), with each file clearly delineated with its path in a markdown-like format (e.g., \`\`\`tsx file="path/to/file.tsx" ... \`\`\`). Include TypeScript, Tailwind CSS, and shadcn/ui (or other sensible defaults if not specified in the description or site config).`;
    const expectedPrompt = `${baseTemplate}\n\n${siteConfigIntegration}\n\n${userCustomization}\n\n${outputFormatInstruction}`;

    expect(generateText).toHaveBeenCalledWith({
      model: "mocked-vercel-model",
      prompt: expectedPrompt,
      headers: {
        Authorization: "Bearer test-api-key",
      },
    });
    expect(vercel).toHaveBeenCalledWith("v0-1.0-md");
    expect(result).toEqual({
      success: true,
      data: mockGeneratedText,
      error: null,
    });
  });

  it("should return error if scrapeAndAnalyzeWebsite fails", async () => {
    const scraperError = new Error("Scraping failed miserably");
    (scrapeAndAnalyzeWebsite as jest.Mock).mockRejectedValue(scraperError);

    const result = await generateV0Text({
      projectDescription: mockProjectDescription,
      url: mockUrl,
      workspaceId: mockWorkspaceId,
    });

    expect(generateText).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      data: null,
      error: `Failed to fetch site configuration: ${scraperError.message}`,
    });
  });

  it("should return error if generateText (v0 API) fails", async () => {
    (scrapeAndAnalyzeWebsite as jest.Mock).mockResolvedValue(mockSiteConfig);
    const apiError = new Error("V0 API blew up");
    (generateText as jest.Mock).mockRejectedValue(apiError);

    const result = await generateV0Text({
      projectDescription: mockProjectDescription,
      url: mockUrl,
      workspaceId: mockWorkspaceId,
    });

    expect(result).toEqual({
      success: false,
      data: null,
      error: `Failed to generate text from v0 API: ${apiError.message}`,
    });
  });

  it("should return error if V0_API_KEY is not configured", async () => {
    process.env.V0_API_KEY = undefined;

    const result = await generateV0Text({
      projectDescription: mockProjectDescription,
      url: mockUrl,
      workspaceId: mockWorkspaceId,
    });

    expect(scrapeAndAnalyzeWebsite).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      data: null,
      error: "V0_API_KEY is not configured.",
    });
  });
});

describe("parseV0Output", () => {
  it("should correctly parse valid input with multiple files", () => {
    const validInput = `
Some introductory text.

\`\`\`tsx file="app/components/Button.tsx"
export const Button = () => <button>Click me</button>;
\`\`\`

Some text between blocks.

\`\`\`json file="package.json"
{
  "name": "test-project"
}
\`\`\`

\`\`\` file="README.md"
# Test Project
\`\`\`
`;
    const expected = [
      {
        filePath: "app/components/Button.tsx",
        content: "export const Button = () => <button>Click me</button>;",
      },
      { filePath: "package.json", content: '{\n  "name": "test-project"\n}' },
      { filePath: "README.md", content: "# Test Project" },
    ];
    expect(parseV0Output(validInput)).toEqual(expected);
  });

  it("should return an empty array for input with no valid file blocks", () => {
    const invalidInput = "No code blocks here, just text.";
    expect(parseV0Output(invalidInput)).toEqual([]);
  });

  it("should handle malformed input gracefully", () => {
    const malformedInput = `
\`\`\`tsx file="app/Good.tsx"
const Good = () => <p>Good</p>;
\`\`\`
\`\`\` file="app/Bad.tsx" 
// Missing closing backticks
`;
    const expected = [
      { filePath: "app/Good.tsx", content: "const Good = () => <p>Good</p>;" },
    ];
    const result = parseV0Output(malformedInput);
    expect(result).toEqual(expected);

    const malformedInput2 = "```tsx file=no_quotes.tsx\ncontent\n```";
    expect(parseV0Output(malformedInput2)).toEqual([]);
  });

  it("should handle different language specifiers and no specifier", () => {
    const input = `
\`\`\`tsx file="component.tsx"
// tsx content
\`\`\`
\`\`\`json file="data.json"
// json content
\`\`\`
\`\`\`js file="script.js"
// js content
\`\`\`
\`\`\` file="text.txt"
// no specifier content
\`\`\`
`;
    const expected = [
      { filePath: "component.tsx", content: "// tsx content" },
      { filePath: "data.json", content: "// json content" },
      { filePath: "script.js", content: "// js content" },
      { filePath: "text.txt", content: "// no specifier content" },
    ];
    expect(parseV0Output(input)).toEqual(expected);
  });
});

describe("createProjectFromV0Output", () => {
  const mockCwd = "/test/cwd";
  const mockProjectName = "my-test-project";
  const mockBasePath = `${mockCwd}/generated_projects`;
  const mockProjectPath = `${mockBasePath}/${mockProjectName}`;

  beforeEach(() => {
    (fs.mkdirSync as jest.Mock).mockReset();
    (fs.writeFileSync as jest.Mock).mockReset();
    (fs.existsSync as jest.Mock).mockReset();
    (path.join as jest.Mock).mockImplementation((...args) => args.join("/"));
    (process.cwd as jest.Mock) = jest.fn(() => mockCwd);
  });

  it("should create files and directories for valid input", async () => {
    const v0ApiOutput = `
\`\`\`ts file="src/index.ts"
console.log('hello');
\`\`\`
\`\`\`md file="README.md"
# Test
\`\`\`
`;
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = await createProjectFromV0Output(v0ApiOutput, mockProjectName);

    expect(fs.existsSync).toHaveBeenCalledWith(mockProjectPath);
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockProjectPath, { recursive: true });
    expect(fs.existsSync).toHaveBeenCalledWith(path.join(mockProjectPath, "src"));
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(mockProjectPath, "src"), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(mockProjectPath, "src/index.ts"),
      "console.log('hello');"
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(mockProjectPath, "README.md"),
      "# Test"
    );
    expect(result).toEqual({
      success: true,
      message: `Project ${mockProjectName} created successfully at ${mockProjectPath}`,
      projectPath: mockProjectPath,
    });
  });

  it("should return error if parseV0Output returns empty array", async () => {
    const v0ApiOutput = "no valid blocks";
    const result = await createProjectFromV0Output(v0ApiOutput, mockProjectName);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      message: "No files found in the API output or failed to parse.",
      projectPath: null,
    });
  });

  it("should return error if file operation fails", async () => {
    const v0ApiOutput = `\`\`\`ts file="src/index.ts"\nconsole.log('fail');\`\`\``;
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("Disk full");
    });

    const result = await createProjectFromV0Output(v0ApiOutput, mockProjectName);
    expect(result).toEqual({
      success: false,
      message: "Error creating project: Disk full",
      projectPath: null,
    });
  });
});

describe("createGithubRepoAndPush", () => {
  const mockProjectName = "my-git-project";
  const mockProjectPath = `/generated_projects/${mockProjectName}`;
  const mockGithubToken = "fake-token";
  const mockRepoUrl = `https://github.com/user/${mockProjectName}.git`;

  let mockExecSync: jest.Mock;
  let mockCreateForAuthenticatedUser: jest.Mock;

  beforeEach(() => {
    mockExecSync = execSync as jest.Mock;
    mockExecSync.mockReset().mockReturnValue(""); // Default success

    mockCreateForAuthenticatedUser = jest.fn().mockResolvedValue({
      data: { clone_url: mockRepoUrl },
    });
    (Octokit as jest.Mock).mockImplementation(() => ({
      rest: {
        repos: {
          createForAuthenticatedUser: mockCreateForAuthenticatedUser,
        },
      },
    }));
  });

  it("should successfully create repo and push", async () => {
    const result = await createGithubRepoAndPush(
      mockProjectName,
      mockProjectPath,
      mockGithubToken
    );

    expect(mockExecSync).toHaveBeenCalledTimes(6); // init, checkout, add, commit, remote add, push
    expect(mockExecSync).toHaveBeenNthCalledWith(1, "git init", { cwd: mockProjectPath, stdio: "pipe" });
    expect(mockExecSync).toHaveBeenNthCalledWith(2, "git checkout -b main", { cwd: mockProjectPath, stdio: "pipe" });
    expect(mockExecSync).toHaveBeenNthCalledWith(3, "git add .", { cwd: mockProjectPath, stdio: "pipe" });
    expect(mockExecSync).toHaveBeenNthCalledWith(4, `git commit -m "Initial commit: scaffold project ${mockProjectName}"`, { cwd: mockProjectPath, stdio: "pipe" });
    expect(mockExecSync).toHaveBeenNthCalledWith(5, `git remote add origin ${mockRepoUrl}`, { cwd: mockProjectPath, stdio: "pipe" });
    expect(mockExecSync).toHaveBeenNthCalledWith(6, "git push -u origin main", { cwd: mockProjectPath, stdio: "pipe" });
    
    expect(mockCreateForAuthenticatedUser).toHaveBeenCalledWith({
      name: mockProjectName,
      private: true,
    });
    expect(result).toEqual({
      success: true,
      message: "Successfully created GitHub repository and pushed initial commit.",
      repoUrl: mockRepoUrl,
    });
  });
  
  it("should handle git init failure", async () => {
    mockExecSync.mockImplementation((command: string) => {
      if (command === "git init") throw new Error("git init failed");
      return "";
    });
    const result = await createGithubRepoAndPush(mockProjectName, mockProjectPath, mockGithubToken);
    expect(result).toEqual({
      success: false,
      message: "Failed to initialize git repository or commit files: git init failed",
      repoUrl: null,
    });
  });

  it("should handle GitHub API failure", async () => {
    mockCreateForAuthenticatedUser.mockRejectedValue(new Error("GitHub API error"));
    const result = await createGithubRepoAndPush(mockProjectName, mockProjectPath, mockGithubToken);
    expect(result).toEqual({
      success: false,
      message: "Failed to create GitHub repository: GitHub API error",
      repoUrl: null,
    });
  });

  it("should handle git push failure", async () => {
    mockExecSync.mockImplementation((command: string) => {
      if (command === "git push -u origin main") throw new Error("git push failed");
      return ""; 
    });
    const result = await createGithubRepoAndPush(mockProjectName, mockProjectPath, mockGithubToken);
    expect(result).toEqual({
      success: false,
      message: "Failed to push to GitHub repository: git push failed",
      repoUrl: mockRepoUrl, 
    });
    expect(mockExecSync).toHaveBeenCalledWith("git init", expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith("git add .", expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("git commit"), expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("git remote add origin"), expect.anything());
  });
});
