"use server";

import { generateText } from "ai";
import { vercel } from "@ai-sdk/vercel";
import { scrapeAndAnalyzeWebsite } from "app/actions/scraper/scraperActions";

// Interface for function parameters (for clarity, TypeScript specific)
// interface GenerateV0TextParams {
//   projectDescription: string;
//   url: string; // Will be used in a subsequent step
//   workspaceId: string; // Will be used in a subsequent step
// }

export async function generateV0Text({
  projectDescription,
  url,
  workspaceId,
}: {
  projectDescription: string;
  url: string;
  workspaceId: string;
}) {
  const apiKey = process.env.V0_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      data: null,
      error: "V0_API_KEY is not configured.",
    };
  }

  let siteConfigData;
  try {
    siteConfigData = await scrapeAndAnalyzeWebsite(url, workspaceId);
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: "Failed to fetch site configuration: " + error.message,
    };
  }

  const siteConfigJsonString = JSON.stringify(siteConfigData, null, 2);
  // siteConfigJsonString will be used in the prompt in the next step.

  try {
    const baseTemplate = `Develop a Next.js website that dynamically renders content based on a JSON configuration file. The website should feature a \`site.config\` file to manage site-wide parameters. The JSON response will provide the data to populate various components. The website should be designed to be responsive and accessible, ensuring a seamless user experience across different devices and browsers. The \`site.config\` file should include parameters such as site title, description, and any other global settings. The website should parse the JSON data and use it to render the necessary components, such as navigation, content sections, and footers. The design should be clean and modern, with a focus on usability and readability. The website should handle potential errors gracefully, providing informative messages to the user if any issues arise during data fetching or rendering. The JSON response will contain the data for the website's content, including text, images, and links. The website should be able to update the content dynamically without requiring code changes. The website should follow best practices for SEO, including proper use of meta tags and semantic HTML. The website should be deployed on Vercel.`;

    const siteConfigIntegration = `Here is the JSON data (SiteConfig) to be used for the website's content and configuration:
${siteConfigJsonString}`;

    const userCustomization = `Additional project requirements or focus areas:
${projectDescription}`;

    const outputFormatInstruction = `Ensure the output is a complete Next.js project structure (files and folders), with each file clearly delineated with its path in a markdown-like format (e.g., \`\`\`tsx file="path/to/file.tsx" ... \`\`\`). Include TypeScript, Tailwind CSS, and shadcn/ui (or other sensible defaults if not specified in the description or site config).`;

    const finalPrompt = `${baseTemplate}\n\n${siteConfigIntegration}\n\n${userCustomization}\n\n${outputFormatInstruction}`;

    const { text } = await generateText({
      model: vercel("v0-1.0-md"),
      prompt: finalPrompt,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return { success: true, data: text, error: null };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: "Failed to generate text from v0 API: " + error.message,
    };
  }
}

import { Octokit } from "octokit";
import { execSync } from "child_process";

export async function createGithubRepoAndPush(
  projectName: string,
  projectPath: string,
  githubToken: string
) {
  // 1. Git Initialization and Commit
  try {
    execSync("git init", { cwd: projectPath, stdio: "pipe" });
    execSync("git checkout -b main", { cwd: projectPath, stdio: "pipe" }); // Ensure 'main' branch
    execSync("git add .", { cwd: projectPath, stdio: "pipe" });
    execSync(`git commit -m "Initial commit: scaffold project ${projectName}"`, {
      cwd: projectPath,
      stdio: "pipe",
    });
  } catch (error: any) {
    return {
      success: false,
      message:
        "Failed to initialize git repository or commit files: " + error.message,
      repoUrl: null,
    };
  }

  // 2. GitHub Repository Creation
  const octokit = new Octokit({ auth: githubToken });
  let repoUrl: string;

  try {
    const repoResponse = await octokit.rest.repos.createForAuthenticatedUser({
      name: projectName,
      private: true, // Or allow user to choose
    });
    repoUrl = repoResponse.data.clone_url;
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to create GitHub repository: " + error.message,
      repoUrl: null,
    };
  }

  // 3. Pushing to GitHub
  try {
    execSync(`git remote add origin ${repoUrl}`, { cwd: projectPath, stdio: "pipe" });
    execSync("git push -u origin main", { cwd: projectPath, stdio: "pipe" });
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to push to GitHub repository: " + error.message,
      repoUrl: repoUrl, // Include repoUrl as it was successfully created
    };
  }

  // 4. Success Response
  return {
    success: true,
    message: "Successfully created GitHub repository and pushed initial commit.",
    repoUrl: repoUrl,
  };
}

import fs from "fs";
import path from "path";

// Interface for the parsed file structure (for clarity, TypeScript specific)
// interface ParsedFile {
//   filePath: string;
//   content: string;
// }

function parseV0Output(v0ApiOutput: string): { filePath: string; content: string }[] {
  const files: { filePath: string; content: string }[] = [];
  // Regex to capture: optional language, file path, and content
  const regex = /```(\w+)?\s*file="([^"]+)"\s*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = regex.exec(v0ApiOutput)) !== null) {
    // match[1] is the optional language (e.g., tsx, json) - currently not used but captured
    // match[2] is the filePath
    // match[3] is the content
    if (match[2] && match[3]) {
      files.push({
        filePath: match[2].trim(),
        content: match[3].trim(),
      });
    }
  }
  return files;
}

export async function createProjectFromV0Output(
  v0ApiOutput: string,
  projectName: string
) {
  const basePath = path.join(process.cwd(), "generated_projects");
  const projectPath = path.join(basePath, projectName);

  try {
    const filesToCreate = parseV0Output(v0ApiOutput);

    if (filesToCreate.length === 0) {
      return { success: false, message: "No files found in the API output or failed to parse.", projectPath: null };
    }

    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    for (const file of filesToCreate) {
      const fullPath = path.join(projectPath, file.filePath);
      const dirName = path.dirname(fullPath);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }
      fs.writeFileSync(fullPath, file.content);
    }

    return {
      success: true,
      message: `Project ${projectName} created successfully at ${projectPath}`,
      projectPath: projectPath,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Error creating project: " + error.message,
      projectPath: null,
    };
  }
}
