import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Layout from './components/Layout';
import useContent from './hooks/useContent';
import styles from './app.styles.scss';

const queryClient = new QueryClient();

const ContentView = () => {
  const { data } = useContent();
  if (!data) {
    return null;
  }
  return (
    <div className={styles.wrapper}>
      <section className={styles.hero}>
        <h1>{data.hero.title}</h1>
        <p className={styles.subtitle}>{data.hero.subtitle}</p>
        <p>{data.hero.description}</p>
      </section>
      <section className={styles.features}>
        {data.features.map((feature) => (
          <article key={feature.name} className={styles.featureCard}>
            <h2>{feature.name}</h2>
            <p>{feature.details}</p>
          </article>
        ))}
      </section>
    </div>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <ContentView />
      </Layout>
    </QueryClientProvider>
  );
};

export default App;
