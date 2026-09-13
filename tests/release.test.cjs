const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {OWNER_MARKER, sourceMarker, selectVersion, planRelease, publishRelease} = require('../.github/scripts/release.cjs');

const sha = 'a'.repeat(40);
const context = {sha, repo: {owner: 'test-owner', repo: 'test-repo'}};
const body = `${OWNER_MARKER}\n${sourceMarker(sha)}`;
const published = (tag, extra = {}) => ({tag_name: tag, draft: false, ...extra});

test('the first successful publication starts at 1.0', () => {
    assert.deepEqual(selectVersion([], sha), {
        version: '1.0', tag: 'v1.0', filename: 'WitherStormBlueMap1.0.jar', skip: false, draft: undefined
    });
});

test('sequential versions sort numerically, including 1.9 to 1.10', () => {
    assert.equal(selectVersion([published('v1.9'), published('v1.2')], sha).version, '1.10');
    assert.equal(selectVersion([published('v1.10'), published('v1.9')], sha).version, '1.11');
});

test('unrelated releases are ignored and legacy 1.0.0 advances to 1.1', () => {
    assert.equal(selectVersion([published('v1.0.0'), published('nightly'), published('v2.0-beta')], sha).version, '1.1');
});

test('re-running a published source commit is idempotent even after later releases', () => {
    const releases = [published('v1.0', {body, assets: [{name: 'WitherStormBlueMap1.0.jar', state: 'uploaded'}]}), published('v1.2')];
    assert.equal(selectVersion(releases, sha).skip, true);
    assert.equal(selectVersion(releases, sha).version, '1.0');
});

test('a published release with a missing JAR cannot silently become a duplicate', () => {
    assert.throws(() => selectVersion([published('v1.0', {body, assets: []})], sha), /JAR is missing/);
});

test('an unfinished upload resumes its version without incrementing', () => {
    const draft = {id: 5, draft: true, tag_name: 'v1.0', body};
    const plan = selectVersion([draft], sha);
    assert.equal(plan.version, '1.0');
    assert.equal(plan.draft, draft);
});

test('an unrelated or different-commit draft is never overwritten', () => {
    assert.throws(() => selectVersion([{draft: true, tag_name: 'v1.0', body: 'manual draft'}], sha), /reserved/);
    assert.throws(() => selectVersion([{draft: true, tag_name: 'v1.0', body}], 'b'.repeat(40)), /reserved/);
});

function fakeApi(releases = [], {tagObject, tagError, failUpload = false} = {}) {
    const calls = [];
    const listReleases = () => {}, listReleaseAssets = () => {};
    return {
        calls,
        async paginate(method, args) {
            assert.equal(args.per_page, 100);
            if (method === listReleases) return releases;
            if (method === listReleaseAssets) return [{id: 99, name: 'WitherStormBlueMap1.0.jar'}];
            throw new Error('Unexpected pagination');
        },
        rest: {
            git: {
                async getRef() {
                    if (tagError) throw tagError;
                    if (!tagObject) throw Object.assign(new Error('missing'), {status: 404});
                    return {data: {object: tagObject}};
                },
                async getTag() { return {data: {object: {type: 'commit', sha}}}; }
            },
            repos: {
                listReleases, listReleaseAssets,
                async createRelease(args) { calls.push(['create', args]); return {data: {...args, id: 5}}; },
                async updateRelease(args) { calls.push(['update', args]); return {data: {...args, id: 5, html_url: 'https://example/release'}}; },
                async deleteReleaseAsset(args) { calls.push(['delete', args]); },
                async uploadReleaseAsset(args) {
                    calls.push(['upload', args]);
                    if (failUpload) throw new Error('upload failed');
                    return {data: {}};
                }
            }
        }
    };
}

async function withJar(callback) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'witherstorm-release-test-'));
    try {
        await fs.writeFile(path.join(directory, 'WitherStormBlueMap1.0.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
        await callback(directory);
    } finally {
        await fs.unlink(path.join(directory, 'WitherStormBlueMap1.0.jar'));
        await fs.rmdir(directory);
    }
}

test('release planning uses the paginated GitHub release history', async () => {
    assert.equal((await planRelease(fakeApi([published('v1.100')]), context)).version, '1.101');
});

test('publication uploads the correctly named asset before making the release public', () => withJar(async directory => {
    const github = fakeApi();
    await publishRelease(github, context, '1.0', directory);
    assert.deepEqual(github.calls.map(([method]) => method), ['create', 'delete', 'upload', 'update']);
    assert.equal(github.calls[0][1].draft, true);
    assert.equal(github.calls[0][1].target_commitish, sha);
    assert.equal(github.calls[0][1].name, 'WitherStormBlueMap1.0');
    assert.equal(github.calls[2][1].name, 'WitherStormBlueMap1.0.jar');
    assert.equal(github.calls.at(-1)[1].draft, false);
}));

test('an upload failure leaves a recoverable draft instead of an empty published release', () => withJar(async directory => {
    const github = fakeApi([], {failUpload: true});
    await assert.rejects(publishRelease(github, context, '1.0', directory), /upload failed/);
    assert.equal(github.calls.some(([method, args]) => method === 'update' && args.draft === false), false);
}));

test('retrying a partial release reuses the draft and replaces only its own named asset', () => withJar(async directory => {
    const github = fakeApi([{id: 5, tag_name: 'v1.0', body, draft: true}]);
    await publishRelease(github, context, '1.0', directory);
    assert.equal(github.calls.some(([method]) => method === 'create'), false);
    assert.equal(github.calls[0][1].release_id, 5);
    assert.equal(github.calls.at(-1)[1].draft, false);
}));

test('existing tags for a different commit and GitHub auth failures prevent all writes', () => withJar(async directory => {
    for (const options of [
        {tagObject: {type: 'commit', sha: 'b'.repeat(40)}},
        {tagError: Object.assign(new Error('forbidden'), {status: 403})}
    ]) {
        const github = fakeApi([], options);
        await assert.rejects(publishRelease(github, context, '1.0', directory));
        assert.deepEqual(github.calls, []);
    }
}));

test('an annotated tag is checked against its actual commit', () => withJar(async directory => {
    const github = fakeApi([], {tagObject: {type: 'tag', sha: 'c'.repeat(40)}});
    await publishRelease(github, context, '1.0', directory);
    assert.equal(github.calls.at(-1)[1].draft, false);
}));

test('a changed release sequence cannot publish an incorrectly numbered build', () => withJar(async directory => {
    const github = fakeApi([published('v1.0')]);
    await assert.rejects(publishRelease(github, context, '1.0', directory), /sequence changed/);
    assert.deepEqual(github.calls, []);
}));
