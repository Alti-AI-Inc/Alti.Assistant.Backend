import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock console to prevent actual logging during tests
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock fs and fsPromises
vi.mock('fs', async (importOriginal) => {
    const actualFs = await importOriginal();
    return {
        ...actualFs,
        promises: {
            writeFile: vi.fn(),
        },
        mkdirSync: vi.fn(),
    };
});

// Mock https
const mockResponse = {
    statusCode: 200,
    headers: {},
    on: vi.fn((event, handler) => {
        if (event === 'data') {
            mockResponse._dataHandler = handler;
        } else if (event === 'end') {
            mockResponse._endHandler = handler;
        }
    }),
    destroy: vi.fn(),
    _emitData: (chunk) => mockResponse._dataHandler(chunk),
    _emitEnd: () => mockResponse._endHandler(),
};
const mockRequest = {
    on: vi.fn((event, handler) => {
        if (event === 'error') {
            mockRequest._errorHandler = handler;
        }
    }),
    _emitError: (error) => mockRequest._errorHandler(error),
};

vi.mock('https', () => ({
    default: {
        get: vi.fn((url, callback) => {
            // Reset mockResponse for each call
            mockResponse.statusCode = 200;
            mockResponse.headers = {};
            mockResponse.on.mockClear();
            mockResponse.destroy.mockClear();
            mockRequest.on.mockClear();
            mockResponse._dataHandler = null;
            mockResponse._endHandler = null;

            // Simulate async call
            setTimeout(() => callback(mockResponse), 0);
            return mockRequest;
        }),
    },
}));

// Mock path and url to control __dirname and file paths
const MOCK_DIRNAME = '/mock/path/to/module';
const MOCK_DATA_DIR = '/mock/path/to/module/data';
const MOCK_OUT_FILE = '/mock/path/to/module/data/flat_wisdom.json';

vi.mock('url', () => ({
    fileURLToPath: vi.fn(() => '/mock/path/to/module/parse_wisdom.js'),
}));

vi.mock('path', () => ({
    default: {
        dirname: vi.fn(() => MOCK_DIRNAME),
        join: vi.fn((...args) => {
            if (args[0] === MOCK_DIRNAME && args[1] === 'data') {
                return MOCK_DATA_DIR;
            }
            if (args[0] === MOCK_DATA_DIR && args[1] === 'flat_wisdom.json') {
                return MOCK_OUT_FILE;
            }
            // Fallback for other path.join calls if any
            return args.join('/');
        }),
    },
}));

// Import the module AFTER mocks are set up
const { fetchText, isChapterHeading, buildDatabase } = await import('./parse_wisdom.js');

describe('parse_wisdom', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-mock console spies as clearAllMocks might reset them if not careful
        consoleLogSpy.mockImplementation(() => {});
        consoleErrorSpy.mockImplementation(() => {});
        fsPromises.writeFile.mockResolvedValue(undefined);
        fs.mkdirSync.mockReturnValue(undefined);
    });

    afterEach(() => {
        // Restore console spies after all tests
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('fetchText', () => {
        it('should successfully fetch text from a URL', async () => {
            const testUrl = 'https://example.com/text.txt';
            const testContent = 'This is some test content.';

            const fetchPromise = fetchText(testUrl);

            // Simulate data and end events
            mockResponse._emitData(Buffer.from(testContent));
            mockResponse._emitEnd();

            const result = await fetchPromise;

            expect(https.default.get).toHaveBeenCalledWith(testUrl, expect.any(Function));
            expect(mockResponse.on).toHaveBeenCalledWith('data', expect.any(Function));
            expect(mockResponse.on).toHaveBeenCalledWith('end', expect.any(Function));
            expect(result).toBe(testContent);
        });

        it('should handle HTTP redirects (302)', async () => {
            const initialUrl = 'https://example.com/old.txt';
            const redirectUrl = 'https://example.com/new.txt';
            const finalContent = 'Redirected content.';

            // Mock the first call to https.get for initialUrl (redirect)
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse, statusCode: 302, headers: { location: redirectUrl } };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitEnd(); // Simulate end for the redirect response
                }, 0);
                return mockRequest;
            });

            // Mock the second call to https.get for redirectUrl (success)
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse, statusCode: 200, headers: {} };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(finalContent));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            const result = await fetchText(initialUrl);

            expect(https.default.get).toHaveBeenCalledTimes(2);
            expect(https.default.get).toHaveBeenCalledWith(initialUrl, expect.any(Function));
            expect(https.default.get).toHaveBeenCalledWith(redirectUrl, expect.any(Function));
            // The destroy method should be called on the response object of the redirect, not the global mockResponse
            // We need to check the specific mockResponse instance used in the first `get` call.
            // This is implicitly covered by the fact that the redirect works and doesn't leak.
            // For a more explicit check, we'd need to capture the `res` object from the mockImplementation.
            // For now, we'll trust the flow.
            expect(result).toBe(finalContent);
        });

        it('should reject on HTTP error (404)', async () => {
            const testUrl = 'https://example.com/notfound.txt';

            const fetchPromise = fetchText(testUrl);

            mockResponse.statusCode = 404;
            mockResponse._emitEnd(); // End the response to trigger error handling

            await expect(fetchPromise).rejects.toThrow(`Failed to fetch ${testUrl}, status code: 404`);
            expect(https.default.get).toHaveBeenCalledWith(testUrl, expect.any(Function));
            expect(mockResponse.destroy).toHaveBeenCalledTimes(1);
        });

        it('should reject on network error', async () => {
            const testUrl = 'https://example.com/error.txt';
            const networkError = new Error('Network timeout');

            const fetchPromise = fetchText(testUrl);

            // Simulate network error
            mockRequest._emitError(networkError);

            await expect(fetchPromise).rejects.toThrow(networkError);
            expect(https.default.get).toHaveBeenCalledWith(testUrl, expect.any(Function));
            // destroy should not be called on response if request itself errors before response is fully processed
            expect(mockResponse.destroy).not.toHaveBeenCalled();
        });

        it('should handle empty content', async () => {
            const testUrl = 'https://example.com/empty.txt';
            const testContent = '';

            const fetchPromise = fetchText(testUrl);

            mockResponse._emitData(Buffer.from(testContent));
            mockResponse._emitEnd();

            const result = await fetchPromise;
            expect(result).toBe(testContent);
        });

        it('should handle content with special characters (UTF-8)', async () => {
            const testUrl = 'https://example.com/utf8.txt';
            const testContent = 'Hello, world! Привет, мир! 你好世界!';

            const fetchPromise = fetchText(testUrl);

            mockResponse._emitData(Buffer.from(testContent, 'utf8'));
            mockResponse._emitEnd();

            const result = await fetchPromise;
            expect(result).toBe(testContent);
        });
    });

    describe('isChapterHeading', () => {
        it('should identify common chapter headings', () => {
            expect(isChapterHeading('CHAPTER I')).toBe(true);
            expect(isChapterHeading('BOOK II')).toBe(true);
            expect(isChapterHeading('PART THREE')).toBe(true);
            expect(isChapterHeading('Chapter 10')).toBe(true);
            expect(isChapterHeading('Book One')).toBe(true);
            expect(isChapterHeading('PART V')).toBe(true);
            expect(isChapterHeading('Chapter X')).toBe(true);
        });

        it('should identify all-caps section titles', () => {
            expect(isChapterHeading('INTRODUCTION')).toBe(true);
            expect(isChapterHeading('THE BEGINNING')).toBe(true);
            expect(isChapterHeading('A SHORT TITLE')).toBe(true);
            expect(isChapterHeading('VERY LONG BUT STILL A HEADING IF ALL CAPS AND NOT TOO LONG')).toBe(true);
        });

        it('should not identify short all-caps phrases as headings', () => {
            expect(isChapterHeading('YES')).toBe(false);
            expect(isChapterHeading('NO')).toBe(false);
            expect(isChapterHeading('A')).toBe(false);
        });

        it('should not identify regular paragraphs as headings', () => {
            expect(isChapterHeading('This is a regular paragraph of text.')).toBe(false);
            expect(isChapterHeading('This paragraph has some words in CAPS like THIS but is not a heading.')).toBe(false);
            expect(isChapterHeading('A very long paragraph that is all caps but exceeds the length limit for all-caps headings to prevent false positives from large blocks of text that might be formatted in all caps for emphasis but are not structural headings. This text is intentionally made long to test the length constraint.')).toBe(false);
        });

        it('should handle mixed case chapter headings', () => {
            expect(isChapterHeading('Chapter One')).toBe(true);
            expect(isChapterHeading('Book Two')).toBe(true);
        });
    });

    describe('buildDatabase', () => {
        const mockGutenbergText1 = `
*** START OF THE PROJECT GUTENBERG EBOOK IMITATION OF CHRIST ***

Title: The Imitation of Christ
Author: Thomas à Kempis

CHAPTER I. OF THE IMITATION OF CHRIST, AND OF CONTEMPT OF ALL THE VANITIES OF THE WORLD.

"He that followeth Me, walketh not in darkness," saith the Lord. These are the words of Christ, by which we are admonished, that we must imitate His life and manners, if we would be truly enlightened, and be delivered from all blindness of heart. Let therefore our chief endeavour be to meditate upon the life of Jesus Christ.

CHAPTER II. OF THE HUMBLE SENTIMENT OF ONESELF.

Every man naturally desireth to know; but what availeth knowledge without the fear of God?

*** END OF THE PROJECT GUTENBERG EBOOK IMITATION OF CHRIST ***
`;
        const mockGutenbergText2 = `
*** START OF THE PROJECT GUTENBERG EBOOK CONFESSIONS OF ST. AUGUSTINE ***

Title: The Confessions of Saint Augustine
Author: Saint Augustine

BOOK I.

1. "Great art Thou, O Lord, and greatly to be praised; great is Thy power, and of Thy wisdom there is no end."

2. And man, a part of Thy creation, desires to praise Thee, man, who bears about with him his mortality, the witness of his sin, and the witness that Thou resistest the proud.

BOOK II.

1. I will now call to mind my past foulness, and the carnal corruptions of my soul; not because I love them, but that I may love Thee, O my God.

*** END OF THE PROJECT GUTENBERG EBOOK CONFESSIONS OF ST. AUGUSTINE ***
`;

        beforeEach(() => {
            // Mock fetchText to return specific content for each source
            https.default.get.mockImplementation((url, callback) => {
                const res = { ...mockResponse }; // Create a fresh response object for each call
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();

                setTimeout(() => {
                    callback(res);
                    if (url.includes('1653')) {
                        res._emitData(Buffer.from(mockGutenbergText1));
                    } else if (url.includes('3296')) {
                        res._emitData(Buffer.from(mockGutenbergText2));
                    } else {
                        res._emitData(Buffer.from('Default content for unknown URL.'));
                    }
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });
        });

        it('should create the data directory and write the database file', async () => {
            await buildDatabase();

            expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_DATA_DIR, { recursive: true });
            expect(fsPromises.writeFile).toHaveBeenCalledWith(
                MOCK_OUT_FILE,
                expect.any(String), // We'll check content more specifically later
                'utf8'
            );
            expect(consoleLogSpy).toHaveBeenCalledWith('Building Wisdom Library...');
            expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully built ${MOCK_OUT_FILE} with ${expect.any(Number)} total entries.`);
        });

        it('should fetch and parse content from all sources', async () => {
            await buildDatabase();

            expect(https.default.get).toHaveBeenCalledTimes(2); // For the two sources
            expect(https.default.get).toHaveBeenCalledWith('https://www.gutenberg.org/cache/epub/1653/pg1653.txt', expect.any(Function));
            expect(https.default.get).toHaveBeenCalledWith('https://www.gutenberg.org/cache/epub/3296/pg3296.txt', expect.any(Function));

            const writtenData = JSON.parse(fsPromises.writeFile.mock.calls[0][1]);

            // Check content from Imitation of Christ
            expect(writtenData).toContainEqual({
                book: 'Imitation of Christ',
                chapter: 1,
                verse: 1,
                text: '"He that followeth Me, walketh not in darkness," saith the Lord. These are the words of Christ, by which we are admonished, that we must imitate His life and manners, if we would be truly enlightened, and be delivered from all blindness of heart. Let therefore our chief endeavour be to meditate upon the life of Jesus Christ.'
            });
            expect(writtenData).toContainEqual({
                book: 'Imitation of Christ',
                chapter: 2,
                verse: 1,
                text: 'Every man naturally desireth to know; but what availeth knowledge without the fear of God?'
            });

            // Check content from Confessions of St. Augustine
            expect(writtenData).toContainEqual({
                book: 'Confessions of St. Augustine',
                chapter: 1,
                verse: 1,
                text: '"Great art Thou, O Lord, and greatly to be praised; great is Thy power, and of Thy wisdom there is no end."'
            });
            expect(writtenData).toContainEqual({
                book: 'Confessions of St. Augustine',
                chapter: 1,
                verse: 2,
                text: 'And man, a part of Thy creation, desires to praise Thee, man, who bears about with him his mortality, the witness of his sin, and the witness that Thou resistest the proud.'
            });
            expect(writtenData).toContainEqual({
                book: 'Confessions of St. Augustine',
                chapter: 2,
                verse: 1,
                text: 'I will now call to mind my past foulness, and the carnal corruptions of my soul; not because I love them, but that I may love Thee, O my God.'
            });

            // Verify the total number of entries, including hardcoded stubs
            // 2 from Imitation, 3 from Confessions = 5
            // Plus 19 hardcoded entries = 24
            expect(writtenData.length).toBe(24);
        });

        it('should handle errors during fetching a source gracefully', async () => {
            // Make the first fetch fail, but the second succeed
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res.statusCode = 500;
                    res._emitEnd();
                }, 0);
                return mockRequest;
            }).mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(mockGutenbergText2));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            await buildDatabase();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error processing Imitation of Christ:',
                expect.any(Error)
            );
            expect(consoleErrorSpy.mock.calls[0][1].message).toContain('Failed to fetch https://www.gutenberg.org/cache/epub/1653/pg1653.txt, status code: 500');

            const writtenData = JSON.parse(fsPromises.writeFile.mock.calls[0][1]);
            // Only Confessions and hardcoded entries should be present
            expect(writtenData.some(entry => entry.book === 'Imitation of Christ')).toBe(false);
            expect(writtenData.some(entry => entry.book === 'Confessions of St. Augustine')).toBe(true);
            // 3 from Confessions + 19 hardcoded = 22
            expect(writtenData.length).toBe(22);
        });

        it('should correctly clean Gutenberg headers/footers', async () => {
            const textWithMarkers = `
Some preamble
*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
Title: Test Book
Author: Test Author

Actual content line 1.

Actual content line 2.
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***
Some postamble
`;
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(textWithMarkers));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            // Mock the second source to return its original content
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(mockGutenbergText2));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            await buildDatabase();

            const writtenData = JSON.parse(fsPromises.writeFile.mock.calls[0][1]);
            const testEntry = writtenData.find(entry => entry.book === 'Imitation of Christ'); // Assuming first source is Imitation
            expect(testEntry.text).not.toContain('*** START OF THE PROJECT GUTENBERG EBOOK');
            expect(testEntry.text).not.toContain('*** END OF THE PROJECT GUTENBERG EBOOK');
            expect(testEntry.text).toContain('Title: Test Book'); // Should still contain the title
            expect(testEntry.text).toContain('Actual content line 1.');
        });

        it('should correctly parse paragraphs and assign chapter/verse numbers', async () => {
            const customText = `
*** START OF THE PROJECT GUTENBERG EBOOK CUSTOM ***
Chapter 1.

This is the first paragraph of chapter one.
It continues here.

CHAPTER II. THE SECOND CHAPTER.

This is the first paragraph of chapter two.

Another paragraph in chapter two.

A short paragraph.
This is a very long paragraph that should be included as a single entry because it is not separated by double newlines and is longer than 20 characters. It demonstrates the paragraph splitting logic.

*** END OF THE PROJECT GUTENBERG EBOOK CUSTOM ***
`;
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(customText));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            // Mock the second source to return its original content
            https.default.get.mockImplementationOnce((url, callback) => {
                const res = { ...mockResponse };
                res.on = vi.fn((event, handler) => {
                    if (event === 'data') res._dataHandler = handler;
                    if (event === 'end') res._endHandler = handler;
                });
                res.destroy = vi.fn();
                setTimeout(() => {
                    callback(res);
                    res._emitData(Buffer.from(mockGutenbergText2));
                    res._emitEnd();
                }, 0);
                return mockRequest;
            });

            await buildDatabase();

            const writtenData = JSON.parse(fsPromises.writeFile.mock.calls[0][1]);
            const customEntries = writtenData.filter(entry => entry.book === 'Imitation of Christ'); // Using first source for custom content

            expect(customEntries.length).toBe(4); // 4 paragraphs expected after cleaning and filtering

            expect(customEntries[0]).toEqual({
                book: 'Imitation of Christ',
                chapter: 1,
                verse: 1,
                text: 'This is the first paragraph of chapter one. It continues here.'
            });
            expect(customEntries[1]).toEqual({
                book: 'Imitation of Christ',
                chapter: 2,
                verse: 1,
                text: 'This is the first paragraph of chapter two.'
            });
            expect(customEntries[2]).toEqual({
                book: 'Imitation of Christ',
                chapter: 2,
                verse: 2,
                text: 'Another paragraph in chapter two.'
            });
            expect(customEntries[3]).toEqual({
                book: 'Imitation of Christ',
                chapter: 2,
                verse: 3,
                text: 'This is a very long paragraph that should be included as a single entry because it is not separated by double newlines and is longer than 20 characters. It demonstrates the paragraph splitting logic.'
            });
        });

        it('should include all hardcoded stub entries', async () => {
            await buildDatabase();
            const writtenData = JSON.parse(fsPromises.writeFile.mock.calls[0][1]);

            const expectedStubBooks = [
                'Book of Enoch', 'The Didache', 'War Scroll',
                'The Interior Castle', 'Dark Night of the Soul', 'Ascent of Mount Carmel',
                'Book of Jubilees', 'Testaments of the Twelve Patriarchs',
                'Sayings of the Desert Fathers', 'The Philokalia',
                'The Shepherd of Hermas', 'The Celestial Hierarchy', 'On the Incarnation',
                'Against Heresies', 'The Rule of St. Benedict', 'Revelations of Divine Love'
            ];

            expectedStubBooks.forEach(book => {
                expect(writtenData.some(entry => entry.book === book)).toBe(true);
            });

            // Check a specific stub entry
            expect(writtenData).toContainEqual({
                book: 'Book of Enoch', chapter: 1, verse: 1, text: 'The word of the blessing of Enoch, how he blessed the elect and the righteous, who were to exist in the time of trouble; rejecting all the wicked and ungodly.'
            });
            expect(writtenData).toContainEqual({
                book: 'The Didache', chapter: 1, verse: 2, text: 'The way of life, then, is this: First, you shall love God who made you; second, love your neighbor as yourself, and do not do to another what you would not want done to you.'
            });
            expect(writtenData).toContainEqual({
                book: 'Revelations of Divine Love', chapter: 1, verse: 1, text: 'And in this he showed me a little thing, the quantity of a hazelnut, lying in the palm of my hand, as it seemed, and it was as round as a ball. I looked upon it with the eye of my understanding, and thought: What may this be? And it was answered generally thus: It is all that is made. I marvelled how it might last, for I thought it might suddenly have fallen to nothing for littleness. And I was answered in my understanding: It lasts and ever shall, for God loves it. And so all things have their beginning by the love of God. And He said: "All shall be well, and all shall be well, and all manner of thing shall be well."'
            });
        });

        it('should log the correct number of entries parsed per source', async () => {
            await buildDatabase();

            expect(consoleLogSpy).toHaveBeenCalledWith('Parsed 2 entries for Imitation of Christ');
            expect(consoleLogSpy).toHaveBeenCalledWith('Parsed 3 entries for Confessions of St. Augustine');
        });
    });
});