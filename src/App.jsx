import { useState, useRef, useEffect } from 'react';

const SYSTEM_PROMPT = `You are a warm, professional assistant helping collect testimonials for Shannon Anderson-Finch, an executive coach and leadership consultant. Your role is to guide clients through sharing their experience in a conversational way.

CONVERSATION FLOW:
1. Start with exactly: "Welcome, and thanks for taking the time to share your experience working with Shannon. This should take no more than 5 minutes.\n\nTo start: What brought you to working with Shannon as an executive coach?"
2. After they respond: "What shifted or changed through your work together?"
3. After they describe the shift/change, ask a follow-up that references their specific answer: "What specifically about working with Shannon helped you [paraphrase what they said shifted or changed]?"
4. Then: "What surprised you about working with Shannon?"
5. Finally: "What would you tell someone considering working with Shannon?"
6. After all questions, ask about attribution in a natural way: "Last thing: how would you like to be credited? Let me know what you're comfortable sharing—your name (full, first name only, or initials), title, company or industry, and location."

7. After attribution, say: "Let me put that together for you." Then compile their responses into a polished first-person testimonial paragraph and present it. Ask: "How does this look? Feel free to suggest any changes, or let me know if it's good to go."

8. If they request changes, revise and present again. Once they approve the text (e.g., "looks good", "that's fine", "approved"), ask for explicit permission: "Great! One last thing: do I have your permission to use this testimonial on the web, social media, and in printed materials to help others understand what working with Shannon is like?"

9. Once they confirm permission, thank them and end.

GUIDELINES:
- Be warm but concise - no more than 2-3 sentences per response
- Ask ONE question at a time
- Acknowledge what they shared briefly before moving to the next question
- If they give a very short or one-word answer, gently ask for a bit more detail (e.g., "Could you say a bit more about that?" or "What did that look like for you?")
- Don't be effusive or overly enthusiastic
- Keep the whole interaction under 5 minutes
- When compiling a testimonial, write it in first person from their perspective, keeping their authentic voice

TRACKING:
After each response, internally note which step you're on (questions 1-5, then attribution, then draft review, then permission request).
When the client grants permission to use the testimonial, end with "TESTIMONIAL_COMPLETE" on its own line, followed by a JSON block with this structure:
\`\`\`json
{
  "answers": {
    "brought_to_work": "their answer",
    "what_shifted": "their answer",
    "what_helped_shift": "their answer to the follow-up about what specifically helped",
    "what_surprised": "their answer",
    "recommendation": "their answer"
  },
  "attribution": {
    "name": "their name as they want it displayed, or empty if anonymous",
    "title": "their job title, or empty",
    "company_or_industry": "company name or industry description, or empty",
    "location": "city/region, or empty"
  },
  "compiled_testimonial": "the final approved testimonial paragraph",
  "permission_granted": true
}
\`\`\``;

export default function TestimonialCollector() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [testimonialData, setTestimonialData] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const parseCompletion = (text) => {
    if (text.includes('TESTIMONIAL_COMPLETE')) {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (e) {
          console.error('Failed to parse testimonial JSON:', e);
        }
      }
    }
    return null;
  };

  const cleanResponse = (text) => {
    return text
      .replace(/TESTIMONIAL_COMPLETE[\s\S]*```json[\s\S]*```/g, '')
      .trim();
  };

  const callAPI = async (conversationHistory) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });
    const data = await response.json();
    return data.content.map(c => c.text || '').join('\n');
  };

  const startConversation = async () => {
    setHasStarted(true);
    setIsLoading(true);
    
    try {
      const initialMessage = [{ role: 'user', content: '[Client has opened the testimonial form. Begin the conversation.]' }];
      const response = await callAPI(initialMessage);
      setMessages([{ role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Error starting conversation:', error);
      setMessages([{ role: 'assistant', content: 'I apologize, but I encountered an error. Please refresh and try again.' }]);
    }
    
    setIsLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const historyForAPI = [
        { role: 'user', content: '[Client has opened the testimonial form. Begin the conversation.]' },
        ...newMessages
      ];
      
      const response = await callAPI(historyForAPI);
      const data = parseCompletion(response);
      
      if (data) {
        // Add the full conversation transcript to the data
        data.transcript = newMessages.map(m => ({
          role: m.role === 'user' ? 'Client' : 'Agent',
          content: m.content
        }));
        setTestimonialData(data);
        setIsComplete(true);
        const cleanedResponse = cleanResponse(response);
        if (cleanedResponse) {
          setMessages([...newMessages, { role: 'assistant', content: cleanedResponse }]);
        }
      } else {
        setMessages([...newMessages, { role: 'assistant', content: response }]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages([...newMessages, { role: 'assistant', content: 'I apologize, but I encountered an error. Please try again.' }]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const generateEmailLink = () => {
    if (!testimonialData) return '#';
    
    const name = testimonialData.attribution?.name || 'Anonymous';
    const subject = encodeURIComponent(`Testimonial from ${name}`);
    
    const attribution = [
      testimonialData.attribution?.name,
      testimonialData.attribution?.title,
      testimonialData.attribution?.company_or_industry,
      testimonialData.attribution?.location
    ].filter(Boolean).join(', ');
    
    const transcriptText = testimonialData.transcript
      ?.map(m => `${m.role}: ${m.content}`)
      .join('\n\n') || '';
    
    const body = encodeURIComponent(
`TESTIMONIAL
===========
"${testimonialData.compiled_testimonial}"

— ${attribution || 'Anonymous'}

PERMISSION: ${testimonialData.permission_granted ? 'Granted for web, social, and print' : 'Not granted'}

RAW ANSWERS
===========
What brought them to work with you:
${testimonialData.answers?.brought_to_work || 'N/A'}

What shifted/changed:
${testimonialData.answers?.what_shifted || 'N/A'}

What specifically helped:
${testimonialData.answers?.what_helped_shift || 'N/A'}

What surprised them:
${testimonialData.answers?.what_surprised || 'N/A'}

Recommendation:
${testimonialData.answers?.recommendation || 'N/A'}

FULL TRANSCRIPT
===============
${transcriptText}
`
    );
    
    // Testimonials inbox
    return `mailto:testimonials@andersonfinch.com?subject=${subject}&body=${body}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #faf9f7 0%, #f5f3f0 50%, #ebe8e4 100%)',
      fontFamily: "'Source Serif 4', Georgia, serif",
      padding: '2rem',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,500&family=DM+Sans:wght@400;500&display=swap');
      `}</style>
      
      <div style={{
        maxWidth: '640px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <header style={{
          marginBottom: '2.5rem',
          textAlign: 'center'
        }}>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 300,
            color: '#2d2a26',
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem'
          }}>
            Shannon Anderson-Finch
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.8rem',
            color: '#7a756d',
            textTransform: 'uppercase',
            letterSpacing: '0.15em'
          }}>
            Client Testimonial
          </p>
        </header>

        {!hasStarted ? (
          /* Welcome Screen */
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '3rem 2rem',
            boxShadow: '0 2px 20px rgba(0,0,0,0.04)',
            textAlign: 'center'
          }}>
            <p style={{
              fontSize: '1.1rem',
              color: '#4a463f',
              lineHeight: 1.7,
              marginBottom: '2rem'
            }}>
              Thank you for taking a few minutes to share your experience. Your feedback helps others understand what working together might look like.
            </p>
            <button
              onClick={startConversation}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.9rem',
                fontWeight: 500,
                padding: '0.9rem 2.5rem',
                background: '#2d2a26',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.target.style.background = '#4a463f'}
              onMouseOut={(e) => e.target.style.background = '#2d2a26'}
            >
              Begin
            </button>
          </div>
        ) : isComplete && testimonialData ? (
          /* Completion Screen */
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2.5rem 2rem',
            boxShadow: '0 2px 20px rgba(0,0,0,0.04)'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 400,
              color: '#2d2a26',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              Thank you
            </h2>
            
            {testimonialData.compiled_testimonial && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#7a756d',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '0.75rem'
                }}>
                  Your Testimonial
                </h3>
                <div style={{
                  background: '#faf9f7',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  borderLeft: '3px solid #c9a77d'
                }}>
                  <p style={{
                    fontSize: '1rem',
                    color: '#4a463f',
                    lineHeight: 1.7,
                    fontStyle: 'italic',
                    margin: 0
                  }}>
                    "{testimonialData.compiled_testimonial}"
                  </p>
                  {testimonialData.attribution.name && (
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.85rem',
                      color: '#7a756d',
                      marginTop: '1rem',
                      marginBottom: 0
                    }}>
                      — {testimonialData.attribution.name}
                      {testimonialData.attribution.title && `, ${testimonialData.attribution.title}`}
                      {testimonialData.attribution.company_or_industry && `, ${testimonialData.attribution.company_or_industry}`}
                      {testimonialData.attribution.location && ` · ${testimonialData.attribution.location}`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => copyToClipboard(testimonialData.compiled_testimonial)}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.8rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: '#7a756d',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '1rem'
                  }}
                >
                  Copy to clipboard
                </button>
              </div>
            )}
            
            <div style={{
              padding: '1.5rem',
              background: '#f5f3f0',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.9rem',
                color: '#4a463f',
                marginBottom: '1rem'
              }}>
                Click below to send your testimonial to Shannon:
              </p>
              <a
                href={generateEmailLink()}
                style={{
                  display: 'inline-block',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  padding: '0.9rem 2rem',
                  background: '#2d2a26',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  cursor: 'pointer'
                }}
              >
                Submit via Email
              </a>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem',
                color: '#7a756d',
                marginTop: '1rem',
                marginBottom: 0
              }}>
                This will open your email app with everything pre-filled.
              </p>
            </div>

            {/* Backup option if email doesn't work */}
            <details style={{ marginTop: '2rem' }}>
              <summary style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem',
                color: '#7a756d',
                cursor: 'pointer'
              }}>
                Email not working? Copy data manually
              </summary>
              <pre style={{
                fontSize: '0.7rem',
                background: '#f5f3f0',
                padding: '1rem',
                borderRadius: '6px',
                overflow: 'auto',
                marginTop: '0.5rem'
              }}>
                {JSON.stringify(testimonialData, null, 2)}
              </pre>
              <button
                onClick={() => copyToClipboard(JSON.stringify(testimonialData, null, 2))}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.8rem',
                  background: 'transparent',
                  color: '#7a756d',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginTop: '0.5rem'
                }}
              >
                Copy JSON
              </button>
            </details>
          </div>
        ) : (
          /* Conversation Screen */
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 20px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '70vh',
            maxHeight: '600px'
          }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.5rem'
            }}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: '1.25rem',
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '85%',
                    padding: '1rem 1.25rem',
                    borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: msg.role === 'user' ? '#2d2a26' : '#f5f3f0',
                    color: msg.role === 'user' ? 'white' : '#4a463f'
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: '0.95rem',
                      lineHeight: 1.6,
                      fontFamily: msg.role === 'user' ? "'DM Sans', sans-serif" : "'Source Serif 4', Georgia, serif"
                    }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '1rem'
                }}>
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#c9a77d',
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`
                      }}
                    />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #ebe8e4'
            }}>
              <div style={{
                display: 'flex',
                gap: '0.75rem'
              }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your response..."
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.95rem',
                    padding: '0.75rem 1rem',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    resize: 'none',
                    minHeight: '48px',
                    maxHeight: '120px',
                    outline: 'none'
                  }}
                  rows={1}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    padding: '0 1.5rem',
                    background: isLoading || !input.trim() ? '#ddd' : '#2d2a26',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isLoading || !input.trim() ? 'default' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
        `}</style>
      </div>
    </div>
  );
}
