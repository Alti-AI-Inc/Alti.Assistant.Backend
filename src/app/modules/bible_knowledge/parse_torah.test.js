import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock fs/promises
const mockMkdir = vi.fn(() => Promise.resolve());
const mockWriteFile = vi.fn(() => Promise.resolve());
vi.mock('fs/promises', () => ({
    default: {
        mkdir: mockMkdir,
        writeFile: mockWriteFile,
    },
}));

// Mock https
const mockHttpsGet = vi.fn();
vi.mock('https', () => ({
    default: {
        get: mockHttpsGet,
    },
}));

// Mock path and url to control __dirname and __filename and ensure predictable paths
const MOCK_DIRNAME = '/mock/src/app/modules/bible_knowledge';
const MOCK_DATA_DIR = `${MOCK_DIRNAME}/data`;
const MOCK_OUT_JPS = `${MOCK_DATA_DIR}/flat_jps.json`;
const MOCK_OUT_HEB = `${MOCK_DATA_DIR}/flat_hebrew.json`;

const mockPathJoin = vi.fn((...args) => args.join('/'));
const mockPathDirname = vi.fn(() => MOCK_DIRNAME);
const mockFileURLToPath = vi.fn(() => `${MOCK_DIRNAME}/parse_torah.js`);

vi.mock('path', () => ({
    default: {
        join: mockPathJoin,
        dirname: mockPathDirname,
    },
}));

vi.mock('url', () => ({
    fileURLToPath: mockFileURLToPath,
}));

// Helper to mock a successful HTTPS download
const mockSuccessfulDownload = (data) => {
    const mockRequest = new EventEmitter(); // Represents the ClientRequest object returned by https.get
    mockHttpsGet.mockImplementation((url, callback) => {
        const mockResponse = new EventEmitter(); // Represents the IncomingMessage object
        mockResponse.statusCode = 200;
        mockResponse.resume = vi.fn(); // Mock resume to prevent unhandled stream errors

        process.nextTick(() => {
            callback(mockResponse);
            mockResponse.emit('data', JSON.stringify(data));
            mockResponse.emit('end');
        });
        return mockRequest;
    });
};

// Helper to mock a failed HTTPS download (network error)
const mockFailedDownload = (error) => {
    const mockRequest = new EventEmitter();
    mockHttpsGet.mockImplementation((url, callback) => {
        process.nextTick(() => {
            mockRequest.emit('error', error);
        });
        return mockRequest;
    });
};

// Helper to mock an HTTP status error
const mockHttpError = (statusCode) => {
    const mockRequest = new EventEmitter();
    mockHttpsGet.mockImplementation((url, callback) => {
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = statusCode;
        mockResponse.resume = vi.fn(); // Mock resume to prevent unhandled stream errors
        process.nextTick(() => {
            callback(mockResponse);
            mockResponse.emit('end');
        });
        return mockRequest;
    });
};

// Sample Tanakh data for testing
const sampleTanakhData = {
    "Genesis": {
        "1": [
            { "verse_en": "In the beginning God created the heaven and the earth.", "verse_he": "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃" },
            { "verse_en": "And the earth was unformed and void...", "verse_he": "וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ..." }
        ],
        "2": [
            { "verse_en": "Thus the heaven and the earth were finished...", "verse_he": "וַיְכֻלּוּ הַשָּׁמַיִם וְהָאָרֶץ..." }
        ]
    },
    "Exodus": {
        "1": [
            { "verse_en": "Now these are the names of the sons of Israel...", "verse_he": "וְאֵלֶּה שְׁמוֹת בְּנֵי יִשְׂרָאֵל..." }
        ]
    },
    "1 Samuel": { // Test book name variation handled by explicit if-else
        "1": [
            { "verse_en": "There was a certain man of Ramathaim-zophim...", "verse_he": "וַיְהִי אִישׁ אֶחָד מִן הָרָמָתַיִם צוֹפִים..." }
        ]
    },
    "Song of Songs": { // Test book name variation handled by explicit if-else
        "1": [
            { "verse_en": "The song of songs, which is Solomon's.", "verse_he": "שִׁיר הַשִּׁירִים אֲשֶׁר לִשְׁלֹמֹה׃" }
        ]
    },
    "Unknown Book": { // Test unknown book, should trigger console.warn
        "1": [
            { "verse_en": "This should be skipped.", "verse_he": "זה צריך לדלג." }
        ]
    },
    "Psalms": {
        "1": [
            { "verse_en": "Happy is the man that hath not walked in the counsel of the wicked...", "verse_he": "אַשְׁרֵי הָאִישׁ אֲשֶׁר לֹא הָלַךְ בַּעֲצַת רְשָׁעִים..." }
        ],
        "2": [
            { "verse_en": "Why are the nations in an uproar?", "verse_he": "לָמָּה רָגְשׁוּ גוֹיִם..." }
        ]
    },
    "Job": { // Test a book with only English or Hebrew (here, both are present)
        "1": [
            { "verse_en": "There was a man in the land of Uz...", "verse_he": "אִישׁ הָיָה בְאֶרֶץ עוּץ..." }
        ]
    },
    "EmptyBook": { // Test an empty book
        "1": []
    },
    "BookWithOnlyEnglish": {
        "1": [
            { "verse_en": "Only English here." }
        ]
    },
    "BookWithOnlyHebrew": {
        "1": [
            { "verse_he": "רק עברית כאן." }
        ]
    }
};

// Expected flattened output for the sample data
const expectedFlatJps = [
    { book: 'GEN', chapter: 1, verse: 1, text: 'In the beginning God created the heaven and the earth.' },
    { book: 'GEN', chapter: 1, verse: 2, text: 'And the earth was unformed and void...' },
    { book: 'GEN', chapter: 2, verse: 1, text: 'Thus the heaven and the earth were finished...' },
    { book: 'EXO', chapter: 1, verse: 1, text: 'Now these are the names of the sons of Israel...' },
    { book: '1SA', chapter: 1, verse: 1, text: 'There was a certain man of Ramathaim-zophim...' },
    { book: 'SNG', chapter: 1, verse: 1, text: "The song of songs, which is Solomon's." },
    { book: 'PSA', chapter: 1, verse: 1, text: 'Happy is the man that hath not walked in the counsel of the wicked...' },
    { book: 'PSA', chapter: 2, verse: 1, text: 'Why are the nations in an uproar?' },
    { book: 'JOB', chapter: 1, verse: 1, text: 'There was a man in the land of Uz...' },
    { book: 'BookWithOnlyEnglish', chapter: 1, verse: 1, text: 'Only English here.' }
];

const expectedFlatHeb = [
    { book: 'GEN', chapter: 1, verse: 1, text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃' },
    { book: 'GEN', chapter: 1, verse: 2, text: 'וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ...' },
    { book: 'GEN', chapter: 2, verse: 1, text: 'וַיְכֻלּוּ הַשָּׁמַיִם וְהָאָרֶץ...' },
    { book: 'EXO', chapter: 1, verse: 1, text: 'וְאֵלֶּה שְׁמוֹת בְּנֵי יִשְׂרָאֵל...' },
    { book: '1SA', chapter: 1, verse: 1, text: 'וַיְהִי אִישׁ אֶחָד מִן הָרָמָתַיִם צוֹפִים...' },
    { book: 'SNG', chapter: 1, verse: 1, text: 'שִׁיר הַשִּׁירִים אֲשֶׁר לִשְׁלֹמֹה׃' },
    { book: 'PSA', chapter: 1, verse: 1, text: 'אַשְׁרֵי הָאִישׁ אֲשֶׁר לֹא הָלַךְ בַּעֲצַת רְשָׁעִים...' },
    { book: 'PSA', chapter: 2, verse: 1, text: 'לָמָּה רָגְשׁוּ גוֹיִם...' },
    { book: 'JOB', chapter: 1, verse: 1, text: 'אִישׁ הָיָה בְאֶרֶץ עוּץ...' },
    { book: 'BookWithOnlyHebrew', chapter: 1, verse: 1, text: 'רק עברית כאן.' }
];

describe('downloadAndParse module execution', () => {
    let consoleLogSpy;
    let consoleWarnSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Ensure path mocks are reset to consistent values for each test
        mockPathJoin.mockImplementation((...args) => args.join('/'));
        mockPathDirname.mockReturnValue(MOCK_DIRNAME);
        mockFileURLToPath.mockReturnValue(`${MOCK_DIRNAME}/parse_torah.js`);
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should successfully download, parse, and write flattened data', async () => {
        mockSuccessfulDownload(sampleTanakhData);

        // Dynamically import the module to trigger its execution
        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(mockHttpsGet).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/MarkBuffalo/gen-tanakh/main/tanakh.json',
            expect.any(Function)
        );

        expect(mockMkdir).toHaveBeenCalledTimes(1);
        expect(mockMkdir).toHaveBeenCalledWith(MOCK_DATA_DIR, { recursive: true });

        expect(mockWriteFile).toHaveBeenCalledTimes(2);
        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_JPS,
            JSON.stringify(expectedFlatJps, null, 0),
            'utf8'
        );
        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_HEB,
            JSON.stringify(expectedFlatHeb, null, 0),
            'utf8'
        );

        expect(consoleLogSpy).toHaveBeenCalledWith('Downloading Tanakh JSON...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Parsing Tanakh JSON...');
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Successfully flattened ${expectedFlatJps.length} English verses to ${MOCK_OUT_JPS}`));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Successfully flattened ${expectedFlatHeb.length} Hebrew verses to ${MOCK_OUT_HEB}`));
        expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown book, skipping:', 'Unknown Book');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle network errors during download', async () => {
        const networkError = new Error('Network down');
        mockFailedDownload(networkError);

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith('Downloading Tanakh JSON...');
        expect(consoleErrorSpy).toHaveBeenCalledWith(networkError);
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle HTTP status errors during download (e.g., 404)', async () => {
        mockHttpError(404);

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith('Downloading Tanakh JSON...');
        expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Failed to download Tanakh JSON: HTTP Status 404'));
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON data', async () => {
        mockSuccessfulDownload('this is not valid json');

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith('Downloading Tanakh JSON...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Parsing Tanakh JSON...');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Failed to parse Tanakh JSON: Unexpected token \'h\'')
        }));
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle empty data gracefully', async () => {
        mockSuccessfulDownload({}); // Empty JSON object

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(mockMkdir).toHaveBeenCalledTimes(1);
        expect(mockWriteFile).toHaveBeenCalledTimes(2);
        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_JPS,
            '[]', // Expect empty array
            'utf8'
        );
        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_HEB,
            '[]', // Expect empty array
            'utf8'
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully flattened 0 English verses'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully flattened 0 Hebrew verses'));
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle errors during file writing', async () => {
        mockSuccessfulDownload(sampleTanakhData);
        const writeError = new Error('Disk full');
        mockWriteFile.mockImplementationOnce(() => Promise.resolve()); // JPS write succeeds
        mockWriteFile.mockImplementationOnce(() => Promise.reject(writeError)); // Hebrew write fails

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockHttpsGet).toHaveBeenCalledTimes(1);
        expect(mockMkdir).toHaveBeenCalledTimes(1);
        expect(mockWriteFile).toHaveBeenCalledTimes(2); // Both attempts are made
        expect(consoleErrorSpy).toHaveBeenCalledWith(writeError);
    });

    it('should correctly handle book names with only English or only Hebrew verses', async () => {
        mockSuccessfulDownload(sampleTanakhData);

        await import('../src/app/modules/bible_knowledge/parse_torah.js');

        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_JPS,
            JSON.stringify(expectedFlatJps, null, 0),
            'utf8'
        );
        expect(mockWriteFile).toHaveBeenCalledWith(
            MOCK_OUT_HEB,
            JSON.stringify(expectedFlatHeb, null, 0),
            'utf8'
        );
        // Verify that 'BookWithOnlyEnglish' appears only in JPS and 'BookWithOnlyHebrew' only in Hebrew
        const jpsContent = JSON.parse(mockWriteFile.mock.calls[0][1]);
        const hebContent = JSON.parse(mockWriteFile.mock.calls[1][1]);

        expect(jpsContent.some(v => v.book === 'BookWithOnlyEnglish')).toBe(true);
        expect(jpsContent.some(v => v.book === 'BookWithOnlyHebrew')).toBe(false);

        expect(hebContent.some(v => v.book === 'BookWithOnlyHebrew')).toBe(true);
        expect(hebContent.some(v => v.book === 'BookWithOnlyEnglish')).toBe(false);
    });
});