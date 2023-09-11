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

        // Step 2: Get a summary from GPT-4
        const openAiResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: `Summarise (in no more than 2 sentences) the article with title: "${title}" and content: "${webpageContent}"` }],
            stream: false,
        });

        const summary = openAiResponse.choices[0].message.content;
        console.log(`Summary: ${summary}`)
        // const summary = 'This is a summary'

        // Step 3: Search for the URL in Hacker News and get a summary of the comments
        // Step 2: Search for the URL in Hacker News to get the story ID
        const hnSearchResponse = await axios.get(`http://hn.algolia.com/api/v1/search?query=${encodeURIComponent(url)}&tags=story`);

        if (hnSearchResponse.data.hits.length === 0) {
            return res.status(404).send('Story not found on Hacker News');
        }

        // Get the story ID
        const storyID = hnSearchResponse.data.hits[0].objectID;

        // Step 3: Get all comments for the story
        const hnCommentsResponse = await axios.get(`http://hn.algolia.com/api/v1/search?tags=comment,story_${storyID}`);
        const comments = hnCommentsResponse.data.hits.map(hit => hit.comment_text);
        const limitedComments = comments.slice(0, 25);

        // Step 4: Get a summary of the comments
        const openAiResponseComments = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: limitedComments.map(comment => ({ role: 'user', content: `Here are a number of comments on an article summarised as ${summary}, please provide a summary of the comments below (in no more than 2 sentences): ${comment}` })),
            stream: false,
        });

        const hackerNewsCommentsSummary = openAiResponseComments.choices[0].message.content;

        // Step 4: Create a markdown representation
        const markdownData = `

# ${title}
${url}
${description}

## Summary
${summary}

## Hacker News Comment Summary
${hackerNewsCommentsSummary}
`;



        res.status(200).send(markdownData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});