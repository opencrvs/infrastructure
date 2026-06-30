import { execSync } from "child_process";

export function getRepoInfo() {
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();

    // Handle both SSH and HTTPS formats
    const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);

    if (!match) {
      return { organization: "", repository: "" };
    }

    return {
      organization: match[1],
      repository: match[2]
    };
  } catch {
    return {
      organization: "",
      repository: ""
    };
  }
}