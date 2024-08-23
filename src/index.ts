import { Octokit } from "@octokit/rest";
import { createWriteStream, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import * as github from "@actions/github";
import * as core from "@actions/core";
import createTorrent from "create-torrent";
import fs from "fs";
import { globSync } from "glob";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function downloadFile(owner: string, repo: string, asset_id: number, outputPath: string): Promise<void> {
    const asset = await octokit.rest.repos.getReleaseAsset({
        owner,
        repo,
        asset_id,
        headers: {
            accept: "application/octet-stream",
        },
        request: {
            parseSuccessResponseBody: false,
        },
    });

    const assetStream = asset.data as unknown as NodeJS.ReadableStream;
    const outputFile = createWriteStream(outputPath);
    await pipeline(assetStream, outputFile);
    console.log(`Downloaded ${outputPath}`);
}

async function uploadFileToRelease(owner: string, repo: string, releaseId: number, filePath: string): Promise<void> {
    const fileName = basename(filePath);

    // Read the file content directly as a binary buffer
    const fileContent = readFileSync(filePath);
    const contentLength = fileContent.length;

    // Use Octokit's uploadReleaseAsset method with Buffer workaround
    const response = await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: releaseId,
        name: fileName,
        data: fileContent as unknown as string,  // Cast Buffer to string workaround
        headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": contentLength.toString(),
            "Authorization": `Bearer ${process.env.INPUT_GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    if (response.status !== 201) {
        throw new Error(`Failed to upload file: ${response.status}`);
    }

    console.log(`Uploaded ${fileName} to release assets.`);
}

async function createTorrentFile(filePaths: string[], outputFileName: string, webSeeds: string[]): Promise<void> {
    const torrentPath = join("./torrents", outputFileName);

    const trackers = [
        "udp://9.rarbg.to:2710/announce",
        "udp://explodie.org:6969",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.coppersurfer.tk:6969",
        "udp://tracker.cyberia.is:6969/announce",
        "udp://tracker.empire-js.us:1337",
        "udp://tracker.internetwarriors.net:1337/announce",
        "udp://tracker.leechers-paradise.org:6969",
        "udp://tracker.openbittorrent.com:80/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.pirateparty.gr:6969/announce",
        "udp://tracker.tiny-vps.com:6969/announce"
    ];

    const torrentOptions = {
        urlList: webSeeds,
        announceList: [trackers], // Correctly assign trackers to announceList
    };

    const torrent = await new Promise<Buffer>((resolve, reject) => {
        createTorrent(filePaths, torrentOptions, (err, torrent) =>
            err ? reject(err) : resolve(torrent)
        );
    });

    await fs.promises.writeFile(torrentPath, torrent);
    console.log(`Torrent created: ${torrentPath}`);
}

async function processLocalAssets(): Promise<void> {
    const { owner, repo } = github.context.repo;

    const tagName = process.env.GITHUB_REF?.replace('refs/tags/', '');
    if (!tagName) {
        throw new Error("Could not extract tag name from GITHUB_REF.");
    }

    const filesInput = process.env.INPUT_FILES?.split("\n").filter(Boolean) || [];
    if (filesInput.length === 0) {
        throw new Error("No files provided in the 'files' environment variable.");
    }

    const oneFile = process.env.INPUT_ONEFILE === 'true';

    const downloadDir = "./torrents";
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

    if (oneFile) {
        const filePaths: string[] = filesInput.flatMap(pattern => globSync(pattern.trim()));
        const outputFileName = `${repo}-${tagName}.torrent`;
        const webSeeds = filePaths.map(filePath => `https://github.com/${owner}/${repo}/releases/download/${tagName}/${basename(filePath)}`);
        await createTorrentFile(filePaths, outputFileName, webSeeds);
    } else {
        for (const pattern of filesInput) {
            const matchedFiles = globSync(pattern.trim());
            if (matchedFiles.length === 0) {
                core.error(`No files matched the pattern: ${pattern}`);
                throw new Error(`No files matched the pattern: ${pattern}`);
            }

            for (const filePath of matchedFiles) {
                const outputFileName = `${basename(filePath)}-${tagName}.torrent`;
                const webSeed = `https://github.com/${owner}/${repo}/releases/download/${tagName}/${basename(filePath)}`;
                await createTorrentFile([filePath], outputFileName, [webSeed]);
            }
        }
    }
}

async function processRemoteAssets(): Promise<void> {
    const { owner, repo } = github.context.repo;
    const release = await octokit.rest.repos.getLatestRelease({
        owner,
        repo,
    });

    const downloadDir = "./torrents";
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

    for (const asset of release.data.assets) {
        const filePath = join(downloadDir, asset.name);
        await downloadFile(owner, repo, asset.id, filePath);
        const torrentFileName = `${basename(filePath)}.torrent`;
        await createTorrentFile([filePath], torrentFileName, [asset.browser_download_url]);
        await uploadFileToRelease(owner, repo, release.data.id, join(downloadDir, torrentFileName));
    }
}

async function main() {
    if (process.env.INPUT_LOCAL === 'true') {
        await processLocalAssets();
    } else {
        await processRemoteAssets();
    }

    console.log("All files processed.");
}

main();