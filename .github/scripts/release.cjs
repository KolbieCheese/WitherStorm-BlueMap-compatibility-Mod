const fs = require('node:fs/promises');
const path = require('node:path');

const OWNER_MARKER = '<!-- witherstorm-bluemap automated release -->';
const sourceMarker = sha => `<!-- source-commit: ${sha} -->`;
// Treat a legacy 1.x.0 tag as the same sequence position as 1.x.
const sequence = tag => /^v?1\.(0|[1-9]\d*)(?:\.0)?$/.exec(tag)?.[1];

function selectVersion(releases, sha) {
    const published = releases.filter(release => !release.draft && sequence(release.tag_name) !== undefined);
    const existing = published.find(release => release.body?.includes(OWNER_MARKER)
        && release.body.includes(sourceMarker(sha)));
    if (existing) {
        const version = `1.${sequence(existing.tag_name)}`;
        const filename = `WitherStormBlueMap${version}.jar`;
        if (!existing.assets?.some(asset => asset.name === filename && asset.state === 'uploaded'))
            throw new Error(`${existing.tag_name} is published but its JAR is missing; refusing to create a duplicate release.`);
        return {version, filename, tag: existing.tag_name, skip: true};
    }
    const highest = published.reduce((max, release) => {
        const number = BigInt(sequence(release.tag_name));
        return number > max ? number : max;
    }, -1n);
    const version = `1.${highest + 1n}`;
    const tag = `v${version}`;
    const draft = releases.find(release => release.tag_name === tag);
    if (draft && (!draft.body?.includes(OWNER_MARKER) || !draft.body.includes(sourceMarker(sha))))
        throw new Error(`${tag} is reserved by another draft. Finish/re-run its release or remove that draft before publishing this commit.`);
    return {version, tag, filename: `WitherStormBlueMap${version}.jar`, skip: false, draft};
}

async function planRelease(github, context) {
    const releases = await github.paginate(github.rest.repos.listReleases, {...context.repo, per_page: 100});
    return selectVersion(releases, context.sha);
}

async function assertTagTarget(github, context, tag) {
    let object;
    try {
        object = (await github.rest.git.getRef({...context.repo, ref: `tags/${tag}`})).data.object;
    } catch (error) {
        if (error.status === 404) return; // GitHub will create the new tag at this exact commit.
        throw error;
    }
    // Annotated tags can themselves reference other annotated tags.
    for (let depth = 0; object.type === 'tag' && depth < 10; depth++) {
        object = (await github.rest.git.getTag({...context.repo, tag_sha: object.sha})).data.object;
    }
    if (object.type !== 'commit' || object.sha !== context.sha)
        throw new Error(`${tag} already points elsewhere; refusing to publish the wrong commit or move an existing tag.`);
}

async function publishRelease(github, context, version, directory = 'build/libs') {
    const plan = await planRelease(github, context);
    if (plan.skip) throw new Error('This commit was published while the build was running. Re-run to skip it safely.');
    if (plan.version !== version) throw new Error(`Release sequence changed during build: expected ${version}, now ${plan.version}. Re-run the workflow.`);
    const jar = await fs.readFile(path.join(directory, plan.filename));
    if (jar.length < 4 || jar.readUInt32LE(0) !== 0x04034b50) throw new Error('Release asset is not a JAR/ZIP file.');
    await assertTagTarget(github, context, plan.tag);

    const fields = {
        ...context.repo,
        tag_name: plan.tag,
        target_commitish: context.sha,
        name: `WitherStormBlueMap${version}`,
        body: `${OWNER_MARKER}\n${sourceMarker(context.sha)}\n\n`
            + `Server-side Forge 1.20.1 integration for Cracker's Wither Storm Mod and BlueMap.\n\n`
            + `Download **${plan.filename}** and place it in the server's mods folder.\n\n`
            + `Built from commit ${context.sha}. Java and web compatibility tests passed.\n`
            + `See the [installation guide](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/README.md) for dependencies and setup.`,
        draft: true,
        prerelease: false
    };
    // A draft is not published until its asset upload succeeds. Retrying resumes that draft.
    const release = plan.draft
        ? (await github.rest.repos.updateRelease({...fields, release_id: plan.draft.id})).data
        : (await github.rest.repos.createRelease(fields)).data;
    const assets = await github.paginate(github.rest.repos.listReleaseAssets,
        {...context.repo, release_id: release.id, per_page: 100});
    for (const asset of assets.filter(asset => asset.name === plan.filename)) {
        await github.rest.repos.deleteReleaseAsset({...context.repo, asset_id: asset.id});
    }
    await github.rest.repos.uploadReleaseAsset({
        ...context.repo, release_id: release.id, name: plan.filename, data: jar,
        headers: {'content-type': 'application/java-archive', 'content-length': jar.length}
    });
    return (await github.rest.repos.updateRelease({
        ...context.repo, release_id: release.id, draft: false, make_latest: 'true'
    })).data;
}

module.exports = {OWNER_MARKER, sourceMarker, selectVersion, planRelease, publishRelease};
