import 'dotenv/config'
import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import OpenAIApi from 'openai';


const app = express();
app.use(express.json());

const openai = new OpenAIApi();

app.post('/scrape-and-summarize', async (req, res) => {
    console.log('Received a request to scrape and summarize')
    try {
        console.log(req.body)
        const { url, description } = req.body;
        console.log(`Scraping and summarizing ${url}`)

        // Step 1: Scrape the content of the URL
        const { data: webpageContent } = await axios.get(url);
        const $ = cheerio.load(webpageContent);

        // Get the title from the webpage
        const title = $('head title').text();
        // Get the article text from the webpage (change the selector to match the structure of the webpage)
        // Remove unwanted elements such as asides, image tags, etc.
        $('aside, script, style, img, #comments, .comment, .comments, .comment-list, .comment-content, .comment-body, .disqus-comments, .fb-comments, #comments, #disqus_thread, .comments-area, .comments-section, .user-comments, .post-comments, .blog-comments, .article-comments, .comment-entry, .comment-wrap, .comment-box').remove();

        // Get the article text from the webpage (Change the selector to match the structure of the webpage)
        const articleText = $('.article-content').text() || $('.post-content').text() || $('.entry-content').text() || $('.blog-post-content').text() || $('article').text() || $('body').text();

        // Step 2: Get a summary from GPT-4
        const openAiResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: `Summarise (in no more than 2 sentences) the article with title: "${title}" and content: "${articleText}"` }],
            stream: false,
        });

        const summary = openAiResponse.choices[0].message.content;
        console.log(`Summary: ${summary}`)
        // const summary = 'This is a summary'

        // Step 3: Search for the URL in Hacker News and get a summary of the comments
        // Step 2: Search for the URL in Hacker News to get the story ID
        const hnSearchResponse = await axios.get(`http://hn.algolia.com/api/v1/search?query=${encodeURIComponent(url)}&tags=story`);
        let hackerNewsCommentsSummary;
        let openAiResponseComments;
        if (hnSearchResponse.data.hits.length !== 0) {
            // Get the story ID
            const storyID = hnSearchResponse.data.hits[0].objectID;

            // Step 3: Get all comments for the story
            const hnCommentsResponse = await axios.get(`http://hn.algolia.com/api/v1/search?tags=comment,story_${storyID}`);
            const comments = hnCommentsResponse.data.hits.map(hit => hit.comment_text);
            if (comments.length > 0) {
            const limitedComments = comments.slice(0, 25);

            // Step 4: Get a summary of the comments
             openAiResponseComments = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: limitedComments.map(comment => ({ role: 'user', content: `Here are a number of comments on an article summarised as ${summary}, please provide a summary of the comments below (in no more than 2 sentences): ${comment}` })),
                stream: false,
            });
            }

            hackerNewsCommentsSummary = openAiResponseComments?.choices[0].message.content || 'Not on hacker news';
        }
        // Step 4: Create a markdown representation
        const markdownData = `<h2><a href="${url}">${title}</a></h2><p>${description}</p>
<h3>Summary</h3>
<p>${summary}</p>
<h3>Hacker News Comment Summary</h3>
<p>${hackerNewsCommentsSummary}</p>`;



        res.status(200).send(markdownData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});