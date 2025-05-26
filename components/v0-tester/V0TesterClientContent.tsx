"use client";

import { useState, useEffect } from "react";
// Keep necessary imports like Button, Input, Textarea, Card components, Loader2, toast
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Will need this for project description
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Server actions we will call:
import { generateV0Text, createProjectFromV0Output, createGithubRepoAndPush } from "@/app/actions/v0/v0Actions";

interface V0TesterClientContentProps {
  workspaceId: string;
}

export default function V0TesterClientContent({ workspaceId }: V0TesterClientContentProps) {
  const [projectDescription, setProjectDescription] = useState("");
  const [urlToScrape, setUrlToScrape] = useState("");
  const [projectName, setProjectName] = useState("");
  const [githubToken, setGithubToken] = useState(""); // Added for GitHub token
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false); // Separate loading for GitHub action
  const [generatedFilesPath, setGeneratedFilesPath] = useState<string | null>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [v0ApiOutput, setV0ApiOutput] = useState<string | null>(null); // To display raw v0 output

  // Placeholder for handleSubmit, handleGenerateAndPush functions
  const handleGenerateProject = async () => {
    setIsLoading(true);
    setV0ApiOutput(null);
    setGeneratedFilesPath(null);
    setGithubRepoUrl(null);

    if (!projectDescription || !urlToScrape || !projectName) {
      toast.error("Please fill in Project Description, URL to Scrape, and Project Name.");
      setIsLoading(false);
      return;
    }

    try {
      const v0Result = await generateV0Text({ projectDescription, url: urlToScrape, workspaceId });
      setV0ApiOutput(v0Result.data || JSON.stringify(v0Result.error, null, 2));

      if (!v0Result.success || !v0Result.data) {
        toast.error(v0Result.error || "Failed to generate content from v0 API.");
        setIsLoading(false);
        return;
      }
      toast.success("Successfully generated content from v0 API.");

      const creationResult = await createProjectFromV0Output(v0Result.data, projectName);
      if (creationResult.success) {
        setGeneratedFilesPath(creationResult.projectPath);
        toast.success(creationResult.message);
      } else {
        toast.error(creationResult.message);
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAndPush = async () => {
    setIsLoadingGitHub(true);
    setV0ApiOutput(null);
    setGeneratedFilesPath(null);
    setGithubRepoUrl(null);

    if (!projectDescription || !urlToScrape || !projectName || !githubToken) {
      toast.error("Please fill in all fields, including Project Description, URL, Project Name, and GitHub Token.");
      setIsLoadingGitHub(false);
      return;
    }

    try {
      // Step 1: Generate V0 Text
      const v0Result = await generateV0Text({ projectDescription, url: urlToScrape, workspaceId });
      setV0ApiOutput(v0Result.data || JSON.stringify(v0Result.error, null, 2));

      if (!v0Result.success || !v0Result.data) {
        toast.error(v0Result.error || "Failed to generate content from v0 API.");
        setIsLoadingGitHub(false);
        return;
      }
      toast.success("Successfully generated content from v0 API.");

      // Step 2: Create Project from V0 Output
      const creationResult = await createProjectFromV0Output(v0Result.data, projectName);
      if (!creationResult.success || !creationResult.projectPath) {
        toast.error(creationResult.message || "Failed to create project files.");
        setGeneratedFilesPath(creationResult.projectPath); // Still show path if partially created or error message refers to it
        setIsLoadingGitHub(false);
        return;
      }
      setGeneratedFilesPath(creationResult.projectPath);
      toast.success(creationResult.message || "Project files created successfully.");

      // Step 3: Create GitHub Repo and Push
      const githubResult = await createGithubRepoAndPush(projectName, creationResult.projectPath, githubToken);
      if (githubResult.success) {
        setGithubRepoUrl(githubResult.repoUrl);
        toast.success(githubResult.message);
      } else {
        toast.error(githubResult.message);
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred during the GitHub process: " + error.message);
    } finally {
      setIsLoadingGitHub(false);
    }
  };
  
  return (
    <div className="container py-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">V0 Project Generator Tester</h1>
          <p className="text-muted-foreground">
            Test the v0 API project generation flow.
          </p>
        </div>

        {/* Input Card - Will be expanded in the next step */}
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>
              Provide details for the v0 API to generate the project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="projectDescription" className="block text-sm font-medium text-gray-700 mb-1">Project Description</label>
              <Textarea
                id="projectDescription"
                placeholder="Describe the project you want to generate..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="urlToScrape" className="block text-sm font-medium text-gray-700 mb-1">URL to Scrape (for SiteConfig)</label>
              <Input
                id="urlToScrape"
                type="url"
                placeholder="https://example.com"
                value={urlToScrape}
                onChange={(e) => setUrlToScrape(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <Input
                id="projectName"
                type="text"
                placeholder="my-awesome-project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Used for local directory and GitHub repository name.</p>
            </div>
            <div>
              <label htmlFor="githubToken" className="block text-sm font-medium text-gray-700 mb-1">GitHub Token</label>
              <Input
                id="githubToken"
                type="password"
                placeholder="Enter your GitHub Personal Access Token"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required only for "Generate & Push to GitHub". Needs 'repo' scope.
              </p>
            </div>
            <div className="flex space-x-4">
              <Button onClick={handleGenerateProject} disabled={isLoading || isLoadingGitHub}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Project Files
              </Button>
              <Button onClick={handleGenerateAndPush} disabled={isLoading || isLoadingGitHub}>
                {isLoadingGitHub ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate & Push to GitHub
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Card - Will be expanded later */}
        {v0ApiOutput && (
          <Card>
            <CardHeader><CardTitle>v0 API Output</CardTitle></CardHeader>
            <CardContent><pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">{v0ApiOutput}</pre></CardContent>
          </Card>
        )}
        {generatedFilesPath && (
          <Card>
            <CardHeader><CardTitle>Project Generated</CardTitle></CardHeader>
            <CardContent><p>Project files generated at: {generatedFilesPath}</p></CardContent>
          </Card>
        )}
        {githubRepoUrl && (
          <Card>
            <CardHeader><CardTitle>GitHub Repository</CardTitle></CardHeader>
            <CardContent><p>GitHub repository created: <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="underline">{githubRepoUrl}</a></p></CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
