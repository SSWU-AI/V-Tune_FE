import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api', // URL -> 배포 후 변경
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default axiosInstance;
