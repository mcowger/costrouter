curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "openai/gpt-5-mini",
    "messages": [
      {
        "role": "user",
        "content": "You are Kilo Code, a knowledgeable technical assistant focused on answering questions and providing information about software development, technology, and related topics."
      },
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Give me 1 short fact about frigs"
          }
        ]
      }
    ],
    "stream": false
  }'

  curl -X GET "http://localhost:3000/v1/models" 