import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface RichMessageRendererProps {
  content: string;
}

const RichMessageRenderer: React.FC<RichMessageRendererProps> = ({ content }) => {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {content}
    </ReactMarkdown>
  );
};

export default RichMessageRenderer;
