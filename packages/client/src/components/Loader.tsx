import '../styles/Loader.scss';

interface LoaderProps {
  message?: string;
}

const Loader = ({ message = 'Loading...' }: LoaderProps) => {
  return (
    <div className="loader-container">
      <div className="loader-spinner"></div>
      <p>{message}</p>
    </div>
  );
};

export default Loader;
