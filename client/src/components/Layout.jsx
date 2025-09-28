import PropTypes from 'prop-types';

import styles from './layout.styles.scss';

const Layout = ({ children }) => {
  return <div className={styles.container}>{children}</div>;
};

Layout.propTypes = {
  children: PropTypes.node.isRequired
};

export default Layout;
